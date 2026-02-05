require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const qs = require('querystring');
const path = require('path');

const connectDB = require('./config/database');
const Transaction = require('./models/Transaction');
const Service = require('./models/Service');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const ATLANTIC_BASE_URL = 'https://atlantich2h.com';
const API_KEY = process.env.ATLANTIC_API_KEY;

const config = {
    headers: { 
        'Content-Type': 'application/x-www-form-urlencoded', 
        'User-Agent': 'Atlantic-Vercel/5.0' 
    }
};

connectDB();

// ==========================
// ROUTE HALAMAN (VIEW)
// ==========================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/search', (req, res) => res.sendFile(path.join(__dirname, 'public', 'search.html')));
app.get('/faq', (req, res) => res.sendFile(path.join(__dirname, 'public', 'faq.html')));
app.get('/admin/services', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'services.html')));

// ==========================
// ROUTE ADMIN (LOGIC PROFIT %)
// ==========================

app.post('/api/admin/sync-services', async (req, res) => {
    const { profit } = req.body; 
    const profitPercent = parseFloat(profit) || 0; 

    try {
        const response = await axios.post(`${ATLANTIC_BASE_URL}/layanan/price_list`, 
            qs.stringify({ api_key: API_KEY, type: 'prabayar' }), config);
        
        if (response.data.status && Array.isArray(response.data.data)) {
            const services = response.data.data;
            const operations = services.map(item => {
                const modal = parseInt(item.price);
                
                // Rumus: Modal + (Modal * % / 100)
                let jual = modal + (modal * profitPercent / 100);
                // Pembulatan ke atas ke ratusan terdekat (contoh: 10210 -> 10300)
                jual = Math.ceil(jual / 100) * 100;

                return {
                    updateOne: {
                        filter: { service_id: item.code },
                        update: { 
                            $set: {
                                name: item.name,
                                category: item.category,
                                brand: item.provider,
                                price_original: modal,
                                price_sell: jual, 
                                status_api: item.status,
                                img_url: item.img_url,
                                note: item.note,
                                updated_at: new Date()
                            },
                            $setOnInsert: { is_active: true }
                        },
                        upsert: true
                    }
                };
            });
            await Service.bulkWrite(operations);
            res.json({ status: true, message: `Sync Berhasil! Profit ${profitPercent}% diterapkan.` });
        } else {
            res.json({ status: false, message: "Gagal ambil data Atlantic" });
        }
    } catch (error) { res.status(500).json({ status: false, message: error.message }); }
});

app.get('/api/admin/services', async (req, res) => {
    const data = await Service.find().sort({ category: 1, name: 1 });
    res.json({ status: true, data });
});

app.put('/api/admin/services/:id', async (req, res) => {
    const { price_sell, is_active } = req.body;
    await Service.findByIdAndUpdate(req.params.id, { price_sell: parseInt(price_sell), is_active });
    res.json({ status: true });
});

// ==========================
// ROUTE TRANSAKSI (USER)
// ==========================

app.get('/api/services', async (req, res) => {
    const data = await Service.find({ is_active: true, status_api: 'available' });
    res.json({ status: true, data });
});

app.post('/api/create-payment', async (req, res) => {
    const { service_id, target, email, whatsapp } = req.body;
    try {
        const service = await Service.findOne({ service_id: service_id, is_active: true });
        if (!service) return res.json({ status: false, message: "Layanan tidak aktif" });

        // Nominal Bayar (Harga Jual DB + Fee QRIS)
        const nominalBayar = Math.ceil((service.price_sell + 700) / 0.986);
        const reff_id = `PAY-${Date.now()}`;

        const depoRes = await axios.post(`${ATLANTIC_BASE_URL}/deposit/create`, 
            qs.stringify({ api_key: API_KEY, reff_id, nominal: nominalBayar, type: 'ewallet', metode: 'qris' }), config);

        if (depoRes.data.status) {
            const transaction = new Transaction({
                deposit_id: depoRes.data.data.id,
                order_id: `ORD-${depoRes.data.data.id}`,
                qr_image: depoRes.data.data.qr_image,
                amount: nominalBayar,
                base_price: service.price_original,
                item_name: service.name,
                target, email, whatsapp,
                status: 'pending',
                meta: { code: service.service_id, target: target }
            });
            await transaction.save();
            res.json({ status: true, redirect_url: `/transaction/${transaction.deposit_id}` });
        } else { res.json({ status: false, message: depoRes.data.message }); }
    } catch (e) { res.status(500).json({ status: false, message: "Server Error" }); }
});

app.post('/api/check-status', async (req, res) => {
    const { deposit_id, meta } = req.body;
    try {
        const statusRes = await axios.post(`${ATLANTIC_BASE_URL}/deposit/status`,
            qs.stringify({ api_key: API_KEY, id: deposit_id }), config);
        
        let status = statusRes.data.data.status;

        if (status === 'processing') {
            try { await axios.post(`${ATLANTIC_BASE_URL}/deposit/instant`, qs.stringify({ api_key: API_KEY, id: deposit_id, action: 'true' }), config); status = 'success'; } catch (e) {}
        }

        if (status === 'success') {
            const buyRes = await axios.post(`${ATLANTIC_BASE_URL}/transaksi/create`,
                qs.stringify({ api_key: API_KEY, code: meta.code, target: meta.target, reff_id: `TRX-${deposit_id}` }), config);

            if (buyRes.data.status) {
                await Transaction.updateOne({ deposit_id }, { $set: { status: 'success', sn: buyRes.data.data.sn, updated_at: new Date() } });
                res.json({ status: true, state: 'success', sn: buyRes.data.data.sn });
            } else {
                if(buyRes.data.message.includes('uplicate')) {
                    res.json({ status: true, state: 'success', sn: 'Diproses' });
                } else {
                    await Transaction.updateOne({ deposit_id }, { $set: { status: 'failed' } });
                    res.json({ status: true, state: 'failed', message: buyRes.data.message });
                }
            }
        } else { res.json({ status: true, state: status }); }
    } catch (e) { res.status(500).json({ status: false }); }
});

app.get('/api/transaction/:id', async (req, res) => {
    const data = await Transaction.findOne({ $or: [{ deposit_id: req.params.id }, { order_id: req.params.id }] });
    res.json({ status: !!data, data });
});

app.get('/api/transactions', async (req, res) => {
    const data = await Transaction.find().sort({ created_at: -1 }).limit(100);
    res.json({ status: true, data });
});

app.post('/api/cancel-payment', async (req, res) => {
    try {
        await axios.post(`${ATLANTIC_BASE_URL}/deposit/cancel`, qs.stringify({ api_key: API_KEY, id: req.body.deposit_id }), config);
        await Transaction.updateOne({ deposit_id: req.body.deposit_id }, { $set: { status: 'cancelled' } });
        res.json({ status: true });
    } catch (e) { res.json({ status: true }); }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
