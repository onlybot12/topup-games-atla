require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const qs = require('querystring');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Config
const ATLANTIC_BASE_URL = 'https://atlantich2h.com';
const API_KEY = process.env.ATLANTIC_API_KEY;
const config = {
    headers: { 
        'Content-Type': 'application/x-www-form-urlencoded', 
        'User-Agent': 'Atlantic-Vercel/5.0' 
    }
};

// Storage
const transactions = new Map();

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/services', async (req, res) => {
    try {
        const response = await axios.post(
            `${ATLANTIC_BASE_URL}/layanan/price_list`, 
            qs.stringify({ api_key: API_KEY, type: 'prabayar' }), 
            config
        );
        res.json(response.data);
    } catch (error) {
        console.error("Error:", error.message);
        res.status(500).json({ status: false, message: "Gagal ambil data" });
    }
});

app.post('/api/create-payment', async (req, res) => {
    try {
        const { service_code, target, price_original, email, whatsapp, item_name } = req.body;
        
        const modal = parseInt(price_original);
        const nominalBayar = Math.ceil((modal + 700) / 0.986);
        const reff_id = `PAY-${Date.now()}`;

        const depoRes = await axios.post(
            `${ATLANTIC_BASE_URL}/deposit/create`, 
            qs.stringify({
                api_key: API_KEY, 
                reff_id: reff_id, 
                nominal: nominalBayar,
                type: 'ewallet', 
                metode: 'qris'
            }), 
            config
        );

        if (depoRes.data.status) {
            const depositId = depoRes.data.data.id;
            
            transactions.set(depositId, {
                deposit_id: depositId,
                order_id: `order-${depositId}`,
                qr_image: depoRes.data.data.qr_image,
                amount: nominalBayar,
                base_price: modal,
                item_name: item_name,
                target: target,
                email: email,
                whatsapp: whatsapp,
                status: 'pending',
                created_at: new Date(),
                meta: { code: service_code, target: target }
            });

            res.json({
                status: true,
                redirect_url: `/transaction/${depositId}`,
                data: { deposit_id: depositId, order_id: `order-${depositId}` }
            });
        } else {
            res.json({ status: false, message: depoRes.data.message });
        }
    } catch (error) {
        console.error("Error:", error.message);
        res.status(500).json({ status: false, message: "Server Error" });
    }
});

app.get('/transaction/:deposit_id', (req, res) => {
    const depositId = req.params.deposit_id;
    const transaction = transactions.get(depositId);

    if (!transaction) {
        return res.status(404).send('Transaksi tidak ditemukan');
    }

    res.sendFile(path.join(__dirname, 'public', 'payment.html'));
});

app.get('/api/transaction/:deposit_id', (req, res) => {
    const depositId = req.params.deposit_id;
    const transaction = transactions.get(depositId);

    if (!transaction) {
        return res.status(404).json({ status: false, message: 'Transaksi tidak ditemukan' });
    }

    res.json({ status: true, data: transaction });
});

app.post('/api/check-status', async (req, res) => {
    try {
        const { deposit_id, meta } = req.body;
        
        const statusRes = await axios.post(
            `${ATLANTIC_BASE_URL}/deposit/status`,
            qs.stringify({ api_key: API_KEY, id: deposit_id }), 
            config
        );
        
        let status = statusRes.data.data.status;

        if (status === 'processing') {
            try {
                await axios.post(
                    `${ATLANTIC_BASE_URL}/deposit/instant`,
                    qs.stringify({ api_key: API_KEY, id: deposit_id, action: 'true' }), 
                    config
                );
                status = 'success'; 
            } catch (e) {}
        }

        if (status === 'success') {
            const trxReff = `TRX-${deposit_id}`;
            const buyRes = await axios.post(
                `${ATLANTIC_BASE_URL}/transaksi/create`,
                qs.stringify({
                    api_key: API_KEY, 
                    code: meta.code, 
                    target: meta.target, 
                    reff_id: trxReff
                }), 
                config
            );

            if (buyRes.data.status) {
                const transaction = transactions.get(deposit_id);
                if (transaction) {
                    transaction.status = 'success';
                    transaction.sn = buyRes.data.data.sn;
                    transactions.set(deposit_id, transaction);
                }
                
                res.json({ status: true, state: 'success', sn: buyRes.data.data.sn });
            } else {
                if(buyRes.data.message.includes('uplicate') || buyRes.data.message.includes('sudah ada')) {
                    res.json({ status: true, state: 'success', sn: 'Sedang Diproses' });
                } else {
                    res.json({ status: true, state: 'failed', message: buyRes.data.message });
                }
            }
        } else if (status === 'cancel') {
            res.json({ status: true, state: 'expired' });
        } else {
            res.json({ status: true, state: 'pending' });
        }
    } catch (error) {
        console.error("Error:", error.message);
        res.status(500).json({ status: false });
    }
});

app.post('/api/cancel-payment', async (req, res) => {
    try {
        const { deposit_id } = req.body;
        
        const response = await axios.post(
            `${ATLANTIC_BASE_URL}/deposit/cancel`,
            qs.stringify({ api_key: API_KEY, id: deposit_id }), 
            config
        );
        
        const transaction = transactions.get(deposit_id);
        if (transaction) {
            transaction.status = 'cancelled';
            transactions.set(deposit_id, transaction);
        }
        
        res.json(response.data);
    } catch (error) {
        res.json({ status: true, message: "Cancelled" });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
