require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const qs = require('querystring');
const path = require('path');

const connectDB = require('./config/database');
const Transaction = require('./models/Transaction');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const ATLANTIC_BASE_URL = 'https://atlantich2h.com';
const API_KEY = process.env.ATLANTIC_API_KEY || 'rviGKdaMWIqqG3bYYQGKTHioqOwkEw4hu1s4dPJrootJmQmhzfywCQ48sEe3b6fph8S59gtQKpRk3iXcAXe9L2eGOFqrsBsz5rkJ';

const config = {
    headers: { 
        'Content-Type': 'application/x-www-form-urlencoded', 
        'User-Agent': 'Atlantic-Vercel/5.0' 
    }
};

connectDB();

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'topup.html'));
});

app.get('/api/services', async (req, res) => {
    try {
        const response = await axios.post(`${ATLANTIC_BASE_URL}/layanan/price_list`, 
            qs.stringify({ api_key: API_KEY, type: 'prabayar' }), config);
        
        res.json(response.data);
    } catch (error) {
        console.error("Error fetching services:", error.message);
        res.status(500).json({ status: false, message: "Gagal ambil data" });
    }
});

app.post('/api/create-payment', async (req, res) => {
    const { service_code, target, price_original, email, whatsapp, item_name } = req.body;
    
    const modal = parseInt(price_original);
    const nominalBayar = Math.ceil((modal + 700) / 0.986);
    const reff_id = `PAY-${Date.now()}`;

    try {
        const depoRes = await axios.post(`${ATLANTIC_BASE_URL}/deposit/create`, 
            qs.stringify({
                api_key: API_KEY, reff_id: reff_id, nominal: nominalBayar,
                type: 'ewallet', metode: 'qris'
            }), config);

        if (depoRes.data.status) {
            const depositId = depoRes.data.data.id;
            
            const transaction = new Transaction({
                deposit_id: depositId,
                order_id: `order-${depositId}`,
                qr_image: depoRes.data.data.qr_image,
                amount: nominalBayar,
                base_price: modal,
                item_name: item_name || 'Produk',
                target: target,
                email: email || 'N/A',
                whatsapp: whatsapp || 'N/A',
                status: 'pending',
                meta: { code: service_code, target: target }
            });

            await transaction.save();

            res.json({
                status: true,
                redirect_url: `/transaction/${depositId}`,
                data: {
                    deposit_id: depositId,
                    order_id: `order-${depositId}`,
                    qr_image: depoRes.data.data.qr_image,
                    amount: nominalBayar,
                    meta: { code: service_code, target: target }
                }
            });
        } else {
            res.json({ status: false, message: depoRes.data.message });
        }
    } catch (error) {
        console.error("Error creating payment:", error.message);
        res.status(500).json({ status: false, message: "Server Error" });
    }
});

app.get('/transaction/:deposit_id', async (req, res) => {
    const depositId = req.params.deposit_id;
    
    try {
        const transaction = await Transaction.findOne({ deposit_id: depositId });

        if (!transaction) {
            return res.status(404).send(`
                <html>
                <head><title>Transaksi Tidak Ditemukan</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h2>Transaksi tidak ditemukan</h2>
                    <p>Deposit ID: ${depositId}</p>
                    <a href="/">Kembali ke Home</a>
                </body>
                </html>
            `);
        }

        res.sendFile(path.join(__dirname, 'public', 'payment.html'));
    } catch (error) {
        res.status(500).send('Server Error');
    }
});

app.get('/history/:trx_id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'history.html'));
});

app.get('/api/transaction/:id', async (req, res) => {
    const id = req.params.id;
    
    try {
        const transaction = await Transaction.findOne({
            $or: [
                { deposit_id: id },
                { order_id: id }
            ]
        });

        if (!transaction) {
            return res.status(404).json({ status: false, message: 'Transaksi tidak ditemukan' });
        }

        res.json({
            status: true,
            data: transaction
        });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ status: false, message: 'Server Error' });
    }
});

app.post('/api/check-status', async (req, res) => {
    const { deposit_id, meta } = req.body;
    
    try {
        const statusRes = await axios.post(`${ATLANTIC_BASE_URL}/deposit/status`,
            qs.stringify({ api_key: API_KEY, id: deposit_id }), config);
        
        let status = statusRes.data.data.status;

        if (status === 'processing') {
            try {
                await axios.post(`${ATLANTIC_BASE_URL}/deposit/instant`,
                    qs.stringify({ api_key: API_KEY, id: deposit_id, action: 'true' }), config);
                status = 'success'; 
            } catch (e) {}
        }

        if (status === 'success') {
            const trxReff = `TRX-${deposit_id}`;
            const buyRes = await axios.post(`${ATLANTIC_BASE_URL}/transaksi/create`,
                qs.stringify({
                    api_key: API_KEY, code: meta.code, target: meta.target, reff_id: trxReff
                }), config);

            if (buyRes.data.status) {
                await Transaction.updateOne(
                    { deposit_id: deposit_id },
                    { 
                        $set: { 
                            status: 'success', 
                            sn: buyRes.data.data.sn,
                            updated_at: new Date()
                        } 
                    }
                );
                
                res.json({ status: true, state: 'success', sn: buyRes.data.data.sn });
            } else {
                if(buyRes.data.message.includes('uplicate') || buyRes.data.message.includes('sudah ada')) {
                    res.json({ status: true, state: 'success', sn: 'Sedang Diproses / Cek History' });
                } else {
                    await Transaction.updateOne(
                        { deposit_id: deposit_id },
                        { 
                            $set: { 
                                status: 'failed',
                                updated_at: new Date()
                            } 
                        }
                    );
                    res.json({ status: true, state: 'failed', message: buyRes.data.message });
                }
            }
        } else if (status === 'cancel') {
            await Transaction.updateOne(
                { deposit_id: deposit_id },
                { $set: { status: 'cancelled', updated_at: new Date() } }
            );
            res.json({ status: true, state: 'expired' });
        } else {
            res.json({ status: true, state: 'pending' });
        }
    } catch (error) {
        console.error("Error check status:", error.message);
        res.status(500).json({ status: false });
    }
});

app.post('/api/cancel-payment', async (req, res) => {
    const { deposit_id } = req.body;
    
    try {
        const response = await axios.post(`${ATLANTIC_BASE_URL}/deposit/cancel`,
            qs.stringify({ api_key: API_KEY, id: deposit_id }), config);
        
        await Transaction.updateOne(
            { deposit_id: deposit_id },
            { $set: { status: 'cancelled', updated_at: new Date() } }
        );
        
        res.json(response.data);
    } catch (error) {
        res.json({ status: true, message: "Force closed locally" });
    }
});

app.get('/api/transactions', async (req, res) => {
    try {
        const transactions = await Transaction.find()
            .sort({ created_at: -1 })
            .limit(100);
        
        res.json({
            status: true,
            data: transactions
        });
    } catch (error) {
        res.status(500).json({ status: false, message: 'Server Error' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Ray Store Server running on port ${PORT}`);
    console.log(`📱 Access at: http://localhost:${PORT}`);
});
