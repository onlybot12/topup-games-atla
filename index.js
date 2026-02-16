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
const Voucher = require('./models/Voucher');
const Config = require('./models/Config');
const Brand = require('./models/Brand');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================
// CONFIGURATION & MIDDLEWARE
// ==========================
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Set EJS View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Koneksi Database
connectDB();

const ATLANTIC_BASE_URL = 'https://atlantich2h.com';
const API_KEY = process.env.ATLANTIC_API_KEY || 'rviGKdaMWIqqG3bYYQGKTHioqOwkEw4hu1s4dPJrootJmQmhzfywCQ48sEe3b6fph8S59gtQKpRk3iXcAXe9L2eGOFqrsBsz5rkJ';

const requestHeaders = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'Atlantic-Vercel/5.0' 
};

// ==========================
// ROUTE VIEW (USER SIDE)
// ==========================

// Halaman Utama: Menampilkan daftar Brand Game/Layanan
app.get('/', async (req, res) => {
    try {
        const brands = await Brand.find({ status: 'active' }).sort({ name: 1 });
        res.render('user/indexx', { brands });
    } catch (e) { res.status(500).send("Database Error"); }
});

// Halaman Detail Game Dinamis: /id/free-fire
app.get('/id/:slug', async (req, res) => {
    try {
        const brand = await Brand.findOne({ slug: req.params.slug, status: 'active' });
        if (!brand) return res.status(404).send("Layanan tidak ditemukan");

        const products = await Service.find({ 
            service_id: { $in: brand.services },
            is_active: true,
            status_api: 'available'
        }).sort({ price_sell: 1 });

        res.render('user/detail-game', { brand, products });
    } catch (e) { res.status(500).send("Server Error"); }
});

// Halaman Pembayaran (QRIS)
app.get('/transaction/:deposit_id', async (req, res) => {
    try {
        const tr = await Transaction.findOne({ deposit_id: req.params.id || req.params.deposit_id });
        if (!tr) return res.status(404).send("Transaksi tidak ditemukan");
        res.render('user/payment', { tr: tr });
    } catch (error) { res.status(500).send('Server Error'); }
});

// Halaman Search & FAQ (Sudah ke EJS)
app.get('/search', (req, res) => res.render('user/search'));
app.get('/faq', (req, res) => res.render('user/faq'));

// ==========================
// ROUTE VIEW (ADMIN SIDE)
// ==========================
app.get('/admin/layanan', (req, res) => res.render('admin/kelola-layanan', { currentPage: 'layanan' }));
app.get('/admin/voucher', (req, res) => res.render('admin/create-voucher', { currentPage: 'voucher' }));
app.get('/admin/pengaturan', (req, res) => res.render('admin/pengaturan', { currentPage: 'pengaturan' }));
app.get('/admin/brand', (req, res) => res.render('admin/brand-manage', { currentPage: 'brand' }));

// ==========================
// API: BRAND & SERVICE LINKING
// ==========================
app.get('/api/admin/brands', async (req, res) => {
    const brands = await Brand.find().sort({ name: 1 });
    res.json({ status: true, data: brands });
});

app.post('/api/admin/brands', async (req, res) => {
    try {
        const newBrand = new Brand(req.body);
        await newBrand.save();
        res.json({ status: true, message: "Brand Berhasil Ditambahkan" });
    } catch (e) { res.status(400).json({ status: false, message: "Gagal: Slug duplikat" }); }
});

app.delete('/api/admin/brands/:id', async (req, res) => {
    await Brand.findByIdAndDelete(req.params.id);
    res.json({ status: true });
});

app.get('/api/admin/all-services', async (req, res) => {
    const services = await Service.find({}, 'service_id name brand category price_sell');
    res.json({ status: true, data: services });
});

// ==========================
// API: PENGATURAN BIAYA (QRIS)
// ==========================
app.get('/api/admin/config', async (req, res) => {
    try {
        let conf = await Config.findOne({ key: 'qris_settings' });
        if (!conf) conf = await Config.create({ key: 'qris_settings', admin_fee: 700, tax_percent: 1.4 });
        res.json({ status: true, data: conf });
    } catch (e) { res.status(500).json({ status: false }); }
});

app.put('/api/admin/config', async (req, res) => {
    const { admin_fee, tax_percent } = req.body;
    try {
        await Config.findOneAndUpdate(
            { key: 'qris_settings' },
            { admin_fee: parseInt(admin_fee), tax_percent: parseFloat(tax_percent) },
            { upsert: true }
        );
        res.json({ status: true });
    } catch (e) { res.status(500).json({ status: false }); }
});

// ==========================
// API: LAYANAN (SYNC & DATATABLES)
// ==========================
app.post('/api/admin/sync-services', async (req, res) => {
    const { profit } = req.body;
    const profitPercent = parseFloat(profit) || 0;
    try {
        const response = await axios.post(`${ATLANTIC_BASE_URL}/layanan/price_list`,
            qs.stringify({ api_key: API_KEY, type: 'prabayar' }), { headers: requestHeaders, timeout: 60000 });

        if (response.data.status) {
            const services = response.data.data;
            const operations = services.map(item => {
                const modal = parseInt(item.price) || 0;
                let jual = Math.ceil((modal + (modal * profitPercent / 100)) / 100) * 100;
                return {
                    updateOne: {
                        filter: { service_id: item.code },
                        update: {
                            $set: {
                                name: item.name, category: item.category, brand: item.provider,
                                price_original: modal, price_sell: jual,
                                status_api: item.status.toLowerCase(), img_url: item.img_url, updated_at: new Date()
                            },
                            $setOnInsert: { is_active: true }
                        },
                        upsert: true
                    }
                };
            });
            await Service.bulkWrite(operations);
            res.json({ status: true, message: `Sync ${services.length} data berhasil!` });
        }
    } catch (e) { res.status(500).json({ status: false, message: e.message }); }
});

app.get('/api/admin/services', async (req, res) => {
    try {
        let { draw, start, length, search } = req.query;
        let query = search && search.value ? {
            $or: [ { name: { $regex: search.value, $options: 'i' } }, { service_id: { $regex: search.value, $options: 'i' } } ]
        } : {};

        const total = await Service.countDocuments();
        const filtered = await Service.countDocuments(query);
        let mongoQuery = Service.find(query).sort({ category: 1, name: 1 }).skip(parseInt(start));
        if (parseInt(length) !== -1) mongoQuery = mongoQuery.limit(parseInt(length));
        
        const data = await mongoQuery;
        res.json({ draw: parseInt(draw), recordsTotal: total, recordsFiltered: filtered, data });
    } catch (e) { res.status(500).json({ status: false }); }
});

app.put('/api/admin/services/:id', async (req, res) => {
    try {
        const { price_sell, is_active } = req.body;
        await Service.findByIdAndUpdate(req.params.id, { price_sell, is_active });
        res.json({ status: true });
    } catch (e) { res.status(500).json({ status: false }); }
});

app.delete('/api/admin/delete-services', async (req, res) => {
    try {
        await Service.deleteMany({});
        res.json({ status: true });
    } catch (e) { res.status(500).json({ status: false }); }
});

// ==========================
// API: VOUCHER
// ==========================
app.get('/api/admin/vouchers', async (req, res) => {
    const data = await Voucher.find().sort({ created_at: -1 });
    res.json({ status: true, data });
});

app.post('/api/admin/vouchers', async (req, res) => {
    try {
        const v = new Voucher(req.body);
        await v.save();
        res.json({ status: true });
    } catch (e) { res.status(400).json({ status: false, message: "Kode Duplikat" }); }
});

app.delete('/api/admin/vouchers/:id', async (req, res) => {
    await Voucher.findByIdAndDelete(req.params.id);
    res.json({ status: true });
});

// ==========================
// USER: TRANSACTION LOGIC
// ==========================

app.post('/api/vouchers/verify', async (req, res) => {
    const { code, amount } = req.body;
    try {
        const v = await Voucher.findOne({ code: code.toUpperCase(), is_active: true });
        if (!v || v.used_count >= v.quota || amount < v.min_order) return res.json({ status: false, message: "Voucher Tidak Valid" });
        let discount = v.type === 'percentage' ? (amount * v.value / 100) : v.value;
        res.json({ status: true, discount, code: v.code });
    } catch (e) { res.status(500).json({ status: false }); }
});

app.get('/api/services', async (req, res) => {
    try {
        const data = await Service.find({ is_active: true, status_api: 'available' }).sort({ category: 1, name: 1 });
        res.json({ status: true, data });
    } catch (e) { res.status(500).json({ status: false }); }
});

app.post('/api/create-payment', async (req, res) => {
    const { service_id, target, whatsapp, voucher_code, email } = req.body;
    try {
        const service = await Service.findOne({ service_id, is_active: true });
        if (!service) return res.json({ status: false, message: "Layanan Offline" });

        let conf = await Config.findOne({ key: 'qris_settings' });
        if (!conf) conf = { admin_fee: 700, tax_percent: 1.4 };

        let sellPrice = service.price_sell;

        if (voucher_code) {
            const v = await Voucher.findOne({ code: voucher_code.toUpperCase(), is_active: true });
            if (v && v.used_count < v.quota && sellPrice >= v.min_order) {
                sellPrice -= v.type === 'percentage' ? (sellPrice * v.value / 100) : v.value;
                await Voucher.updateOne({ _id: v._id }, { $inc: { used_count: 1 } });
            }
        }

        const multiplier = (100 - conf.tax_percent) / 100;
        const nominalBayar = Math.ceil((sellPrice + conf.admin_fee) / multiplier);
        const reff_id = `PAY-${Date.now()}`;

        const depoRes = await axios.post(`${ATLANTIC_BASE_URL}/deposit/create`,
            qs.stringify({ api_key: API_KEY, reff_id, nominal: nominalBayar, type: 'ewallet', metode: 'qris' }), 
            { headers: requestHeaders });

        if (depoRes.data.status) {
            const depositId = depoRes.data.data.id;
            const tr = new Transaction({
                deposit_id: depositId,
                order_id: `ORD-${depositId}`,
                qr_image: depoRes.data.data.qr_image,
                amount: nominalBayar,
                base_price: service.price_original,
                item_name: service.name,
                target, whatsapp, status: 'pending',
                email: email || 'customer@lanastore.com',
                meta: { code: service.service_id, target }
            });
            await tr.save();
            res.json({ status: true, redirect_url: `/transaction/${depositId}` });
        } else { res.json({ status: false, message: depoRes.data.message }); }
    } catch (e) { res.status(500).json({ status: false, message: "Server Error" }); }
});

app.post('/api/check-status', async (req, res) => {
    const { deposit_id, meta } = req.body;
    try {
        const statusRes = await axios.post(`${ATLANTIC_BASE_URL}/deposit/status`,
            qs.stringify({ api_key: API_KEY, id: deposit_id }), { headers: requestHeaders });
        let status = statusRes.data.data.status;

        if (status === 'processing') {
            try { await axios.post(`${ATLANTIC_BASE_URL}/deposit/instant`, qs.stringify({ api_key: API_KEY, id: deposit_id, action: 'true' }), { headers: requestHeaders }); status = 'success'; } catch (e) {}
        }

        if (status === 'success') {
            const buyRes = await axios.post(`${ATLANTIC_BASE_URL}/transaksi/create`,
                qs.stringify({ api_key: API_KEY, code: meta.code, target: meta.target, reff_id: `TRX-${deposit_id}` }), 
                { headers: requestHeaders });

            if (buyRes.data.status) {
                await Transaction.updateOne({ deposit_id }, { $set: { status: 'success', sn: buyRes.data.data.sn, updated_at: new Date() } });
                res.json({ status: true, state: 'success', sn: buyRes.data.data.sn });
            } else {
                if(buyRes.data.message.includes('uplicate')) return res.json({ status: true, state: 'success', sn: 'Diproses' });
                await Transaction.updateOne({ deposit_id }, { $set: { status: 'failed' } });
                res.json({ status: true, state: 'failed', message: buyRes.data.message });
            }
        } else if (status === 'cancel') {
            await Transaction.updateOne({ deposit_id }, { $set: { status: 'cancelled' } });
            res.json({ status: true, state: 'expired' });
        } else {
            res.json({ status: true, state: status });
        }
    } catch (error) { res.status(500).json({ status: false }); }
});

app.get('/api/transaction/:id', async (req, res) => {
    try {
        const tr = await Transaction.findOne({ $or: [{ deposit_id: req.params.id }, { order_id: req.params.id }] });
        res.json({ status: !!tr, data: tr });
    } catch (e) { res.status(500).json({ status: false }); }
});

app.get('/api/transactions/recent', async (req, res) => {
    try {
        const data = await Transaction.find().sort({ created_at: -1 }).limit(10).select('order_id whatsapp amount status item_name target created_at');
        res.json({ status: true, data });
    } catch (error) { res.status(500).json({ status: false }); }
});

app.listen(PORT, () => console.log(`🚀 Lana Store Server Berjalan di Port ${PORT}`));
