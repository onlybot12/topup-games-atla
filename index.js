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

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Database Connection
connectDB();

// Konfigurasi Atlantic
const ATLANTIC_BASE_URL = 'https://atlantich2h.com';
const API_KEY = process.env.ATLANTIC_API_KEY || 'rviGKdaMWIqqG3bYYQGKTHioqOwkEw4hu1s4dPJrootJmQmhzfywCQ48sEe3b6fph8S59gtQKpRk3iXcAXe9L2eGOFqrsBsz5rkJ';

// Headers untuk menghindari 403 Forbidden
const requestHeaders = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'Atlantic-Vercel/5.0' 
    
};

// ==========================
// ROUTE VIEW (HALAMAN)
// ==========================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'topup.html')));
app.get('/search', (req, res) => res.sendFile(path.join(__dirname, 'public', 'search.html')));
app.get('/admin/services', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'services.html')));
app.get('/transaction/:deposit_id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'payment.html')));

// ==========================
// ADMIN: MANAGEMENT LAYANAN
// ==========================

// 1. Sync Data dengan Profit % (Optimized for Large Data)
app.post('/api/admin/sync-services', async (req, res) => {
    const { profit } = req.body;
    const profitPercent = parseFloat(profit) || 0;

    console.log(`--- Memulai Sinkronisasi (Profit: ${profitPercent}%) ---`);

    try {
        const response = await axios.post(`${ATLANTIC_BASE_URL}/layanan/price_list`,
            qs.stringify({ api_key: API_KEY, type: 'prabayar' }),
            { headers: requestHeaders, timeout: 60000 } // Timeout 60 detik
        );

        if (response.data && response.data.status === true) {
            const services = response.data.data;

            const operations = services.map(item => {
                const modal = parseInt(item.price) || 0;
                // Hitung Jual + Pembulatan 100 terdekat ke atas
                let jual = modal + (modal * profitPercent / 100);
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
                                status_api: item.status ? item.status.toLowerCase() : 'empty',
                                img_url: item.img_url,
                                updated_at: new Date()
                            },
                            $setOnInsert: { is_active: true }
                        },
                        upsert: true
                    }
                };
            });

            await Service.bulkWrite(operations);
            console.log("Sinkronisasi MongoDB Berhasil.");
            res.json({ status: true, message: `Sync Berhasil! ${services.length} layanan diperbarui.` });
        } else {
            res.json({ status: false, message: response.data.message || "Gagal dari API Atlantic" });
        }
    } catch (error) {
        console.error("Sync Error:", error.message);
        res.status(500).json({ status: false, message: "Terjadi kesalahan koneksi ke Atlantic. Pastikan IP Whitelist sudah benar." });
    }
});

// 2. Server-Side Get Services (Untuk DataTables Anti-Lag)
app.get('/api/admin/services', async (req, res) => {
    try {
        let { draw, start, length, search } = req.query;
        start = parseInt(start) || 0;
        length = parseInt(length) || 10;
        let searchValue = search ? search.value : '';

        let query = {};
        if (searchValue) {
            query = {
                $or: [
                    { name: { $regex: searchValue, $options: 'i' } },
                    { service_id: { $regex: searchValue, $options: 'i' } },
                    { brand: { $regex: searchValue, $options: 'i' } },
                    { category: { $regex: searchValue, $options: 'i' } }
                ]
            };
        }

        const totalRecords = await Service.countDocuments();
        const filteredRecords = await Service.countDocuments(query);

        let mongoQuery = Service.find(query).sort({ category: 1, name: 1 }).skip(start);
        if (length != -1) mongoQuery = mongoQuery.limit(length);

        const data = await mongoQuery;

        res.json({
            draw: parseInt(draw),
            recordsTotal: totalRecords,
            recordsFiltered: filteredRecords,
            data: data
        });
    } catch (error) {
        res.status(500).json({ status: false });
    }
});

// 3. Update Manual Layanan
app.put('/api/admin/services/:id', async (req, res) => {
    try {
        const { price_sell, is_active } = req.body;
        await Service.findByIdAndUpdate(req.params.id, { price_sell: parseInt(price_sell), is_active });
        res.json({ status: true });
    } catch (e) {
        res.status(500).json({ status: false });
    }
});

// 4. Hapus Database Layanan
app.delete('/api/admin/delete-services', async (req, res) => {
    try {
        await Service.deleteMany({});
        res.json({ status: true, message: "Seluruh database layanan telah dihapus." });
    } catch (e) {
        res.status(500).json({ status: false });
    }
});

// ==========================
// USER: TRANSAKSI & PUBLIC
// ==========================

// Ambil Layanan Aktif untuk Pembeli
app.get('/api/services', async (req, res) => {
    try {
        const data = await Service.find({ is_active: true, status_api: 'available' }).sort({ category: 1, name: 1 });
        res.json({ status: true, data });
    } catch (e) {
        res.status(500).json({ status: false });
    }
});

// Buat Pembayaran (Create Deposit)
app.post('/api/create-payment', async (req, res) => {
    const { service_id, target, email, whatsapp } = req.body;
    try {
        const service = await Service.findOne({ service_id, is_active: true });
        if (!service) return res.json({ status: false, message: "Layanan tidak tersedia." });

        // Rumus Nominal Bayar (Harga Jual + Admin Fee QRIS)
        const nominalBayar = Math.ceil((service.price_sell + 700) / 0.986);
        const reff_id = `PAY-${Date.now()}`;

        const depoRes = await axios.post(`${ATLANTIC_BASE_URL}/deposit/create`,
            qs.stringify({ api_key: API_KEY, reff_id, nominal: nominalBayar, type: 'ewallet', metode: 'qris' }),
            { headers: requestHeaders }
        );

        if (depoRes.data.status) {
            const tr = new Transaction({
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
            await tr.save();
            res.json({ status: true, redirect_url: `/transaction/${depoRes.data.data.id}` });
        } else {
            res.json({ status: false, message: depoRes.data.message });
        }
    } catch (e) {
        res.status(500).json({ status: false, message: "Server Error" });
    }
});

// Cek Status Pembayaran & Proses Produk Otomatis
app.post('/api/check-status', async (req, res) => {
    const { deposit_id, meta } = req.body;
    try {
        const statusRes = await axios.post(`${ATLANTIC_BASE_URL}/deposit/status`,
            qs.stringify({ api_key: API_KEY, id: deposit_id }), { headers: requestHeaders });

        let status = statusRes.data.data.status;

        // Jika processing, trigger instant deposit agar saldo masuk cepat
        if (status === 'processing') {
            try {
                await axios.post(`${ATLANTIC_BASE_URL}/deposit/instant`,
                    qs.stringify({ api_key: API_KEY, id: deposit_id, action: 'true' }), { headers: requestHeaders });
                status = 'success';
            } catch (e) {}
        }

        if (status === 'success') {
            // Tembak API Beli Produk
            const buyRes = await axios.post(`${ATLANTIC_BASE_URL}/transaksi/create`,
                qs.stringify({ api_key: API_KEY, code: meta.code, target: meta.target, reff_id: `TRX-${deposit_id}` }),
                { headers: requestHeaders });

            if (buyRes.data.status) {
                await Transaction.updateOne({ deposit_id }, { $set: { status: 'success', sn: buyRes.data.data.sn, updated_at: new Date() } });
                res.json({ status: true, state: 'success', sn: buyRes.data.data.sn });
            } else {
                if (buyRes.data.message.includes('uplicate')) {
                    res.json({ status: true, state: 'success', sn: 'Sedang Diproses' });
                } else {
                    await Transaction.updateOne({ deposit_id }, { $set: { status: 'failed' } });
                    res.json({ status: true, state: 'failed', message: buyRes.data.message });
                }
            }
        } else {
            res.json({ status: true, state: status });
        }
    } catch (e) {
        res.status(500).json({ status: false });
    }
});

// Detail Transaksi by ID
app.get('/api/transaction/:id', async (req, res) => {
    try {
        const tr = await Transaction.findOne({ $or: [{ deposit_id: req.params.id }, { order_id: req.params.id }] });
        res.json({ status: !!tr, data: tr });
    } catch (e) {
        res.status(500).json({ status: false });
    }
});

// History Terakhir
app.get('/api/transactions', async (req, res) => {
    try {
        const data = await Transaction.find().sort({ created_at: -1 }).limit(100);
        res.json({ status: true, data });
    } catch (e) {
        res.status(500).json({ status: false });
    }
});

app.listen(PORT, () => console.log(`🚀 Lana Store Server running on port ${PORT}`));
