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


const config = {
    headers: { 
        'Content-Type': 'application/x-www-form-urlencoded', 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
    }
};

// ==========================
// ROUTE VIEW (HALAMAN)
// ==========================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/search', (req, res) => res.sendFile(path.join(__dirname, 'public', 'search.html')));
app.get('/faq', (req, res) => res.sendFile(path.join(__dirname, 'public', 'faq.html')));
app.get('/admin/services', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'services.html')));
app.get('/transaction/:deposit_id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'payment.html')));
app.get('/history/:trx_id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'history.html')));

// ==========================
// ADMIN: MANAGEMENT LAYANAN
// ==========================

// 1. Sync Data dari API dengan Profit % Global
app.post('/api/admin/sync-services', async (req, res) => {
    const { profit } = req.body; 
    const profitPercent = parseFloat(profit) || 0; 

    try {
        const response = await axios.post(`${ATLANTIC_BASE_URL}/layanan/price_list`, 
            qs.stringify({ api_key: API_KEY, type: 'prabayar' }), config);
        
        if (response.data.status && Array.isArray(response.data.data)) {
            const services = response.data.data;

            const operations = services.map(item => {
                const modal = parseInt(item.price) || 0;
                // Hitung Harga Jual + Pembulatan ke 100 terdekat ke atas
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
                                status_api: item.status.toLowerCase(),
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
            res.json({ status: true, message: `Berhasil Sync ${services.length} layanan dengan profit ${profitPercent}%` });
        } else {
            res.json({ status: false, message: response.data.message || "Gagal mengambil data dari Atlantic" });
        }
    } catch (error) {
        res.status(500).json({ status: false, message: error.message });
    }
});

// 2. Server-Side Get Services (Untuk DataTables Anti-Lag)
app.get('/api/admin/services', async (req, res) => {
    try {
        let { draw, start, length, search } = req.query;
        start = parseInt(start) || 0;
        length = parseInt(length) || 10;
        let searchValue = search ? search.value : '';

        // Filter Pencarian
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

        // Ambil data dengan Pagination
        let mongoQuery = Service.find(query).sort({ category: 1, name: 1 }).skip(start);
        if (length != -1) mongoQuery = mongoQuery.limit(length);
        
        const services = await mongoQuery;

        res.json({
            draw: parseInt(draw),
            recordsTotal: totalRecords,
            recordsFiltered: filteredRecords,
            data: services
        });
    } catch (error) {
        res.status(500).json({ status: false, message: error.message });
    }
});

// 3. Update Manual Layanan (Harga/Status)
app.put('/api/admin/services/:id', async (req, res) => {
    const { price_sell, is_active } = req.body;
    try {
        await Service.findByIdAndUpdate(req.params.id, { 
            price_sell: parseInt(price_sell), 
            is_active: is_active 
        });
        res.json({ status: true });
    } catch (e) {
        res.status(500).json({ status: false });
    }
});

// 4. Hapus Seluruh Database Layanan
app.delete('/api/admin/delete-services', async (req, res) => {
    try {
        const result = await Service.deleteMany({});
        res.json({ status: true, message: `Berhasil menghapus ${result.deletedCount} layanan.` });
    } catch (e) {
        res.status(500).json({ status: false });
    }
});

// ==========================
// USER: TRANSAKSI & PUBLIC
// ==========================

// Ambil Layanan Aktif untuk UI Pembeli
app.get('/api/services', async (req, res) => {
    try {
        const data = await Service.find({ is_active: true, status_api: 'available' }).sort({ category: 1, name: 1 });
        res.json({ status: true, data });
    } catch (e) {
        res.status(500).json({ status: false });
    }
});

// Buat Pembayaran (Deposit Atlantic)
app.post('/api/create-payment', async (req, res) => {
    const { service_id, target, email, whatsapp } = req.body;
    try {
        const service = await Service.findOne({ service_id: service_id, is_active: true });
        if (!service) return res.json({ status: false, message: "Layanan tidak tersedia" });

        // Kalkulasi Nominal (Harga Jual DB + Admin Fee)
        const nominalBayar = Math.ceil((service.price_sell + 700) / 0.986);
        const reff_id = `PAY-${Date.now()}`;

        const depoRes = await axios.post(`${ATLANTIC_BASE_URL}/deposit/create`, 
            qs.stringify({
                api_key: API_KEY, reff_id, nominal: nominalBayar,
                type: 'ewallet', metode: 'qris'
            }), config);

        if (depoRes.data.status) {
            const depositId = depoRes.data.data.id;
            
            const transaction = new Transaction({
                deposit_id: depositId,
                order_id: `ORD-${depositId}`,
                qr_image: depoRes.data.data.qr_image,
                amount: nominalBayar,
                base_price: service.price_original,
                item_name: service.name,
                target: target,
                email: email || 'N/A',
                whatsapp: whatsapp || 'N/A',
                status: 'pending',
                meta: { code: service.service_id, target: target }
            });

            await transaction.save();
            res.json({ status: true, redirect_url: `/transaction/${depositId}` });
        } else {
            res.json({ status: false, message: depoRes.data.message });
        }
    } catch (error) {
        res.status(500).json({ status: false, message: "Server Error" });
    }
});

// Cek Status Pembayaran & Proses Order Otomatis
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
                    { $set: { status: 'success', sn: buyRes.data.data.sn, updated_at: new Date() } }
                );
                res.json({ status: true, state: 'success', sn: buyRes.data.data.sn });
            } else {
                if(buyRes.data.message.includes('uplicate') || buyRes.data.message.includes('sudah ada')) {
                    res.json({ status: true, state: 'success', sn: 'Sedang Diproses' });
                } else {
                    await Transaction.updateOne(
                        { deposit_id: deposit_id },
                        { $set: { status: 'failed', updated_at: new Date() } }
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
        res.status(500).json({ status: false });
    }
});

// Ambil Detail Transaksi (Search by ID)
app.get('/api/transaction/:id', async (req, res) => {
    try {
        const transaction = await Transaction.findOne({
            $or: [ { deposit_id: req.params.id }, { order_id: req.params.id } ]
        });
        if (!transaction) return res.status(404).json({ status: false });
        res.json({ status: true, data: transaction });
    } catch (error) {
        res.status(500).json({ status: false });
    }
});

// Cancel Transaksi manual
app.post('/api/cancel-payment', async (req, res) => {
    const { deposit_id } = req.body;
    try {
        await axios.post(`${ATLANTIC_BASE_URL}/deposit/cancel`,
            qs.stringify({ api_key: API_KEY, id: deposit_id }), config);
        await Transaction.updateOne(
            { deposit_id: deposit_id },
            { $set: { status: 'cancelled', updated_at: new Date() } }
        );
        res.json({ status: true });
    } catch (error) {
        res.json({ status: true });
    }
});

// List History Transaksi (Recent)
app.get('/api/transactions/recent', async (req, res) => {
    try {
        const data = await Transaction.find()
            .sort({ created_at: -1 })
            .limit(10)
            .select('order_id whatsapp amount status created_at');
        res.json({ status: true, data });
    } catch (error) {
        res.status(500).json({ status: false });
    }
});

app.get('/api/transactions', async (req, res) => {
    try {
        const data = await Transaction.find().sort({ created_at: -1 }).limit(100);
        res.json({ status: true, data });
    } catch (error) {
        res.status(500).json({ status: false });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Ray Store Server running on port ${PORT}`);
    console.log(`📱 Admin Services: http://localhost:${PORT}/admin/services`);
});
