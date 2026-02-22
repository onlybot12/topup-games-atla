require('dotenv').config() /;
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const qs = require('querystring');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const connectDB = require('./config/database');
const AdminLog = require('./models/AdminLog');
const Transaction = require('./models/Transaction');
const Service = require('./models/Service');
const Voucher = require('./models/Voucher');
const Config = require('./models/Config');
const Brand = require('./models/Brand');
const Banner = require('./models/Banner'); // Tambahan Model
const FlashSale = require('./models/FlashSale'); // Tambahan Model

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================
// CONFIGURATION & MIDDLEWARE
// ==========================
app.use(cors());
app.use(session({
    secret: 'admin-login-secret', // Ganti dengan kunci rahasia bebas
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // Berlaku 24 Jam
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Set EJS View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Koneksi Database
connectDB();

// --- MIDDLEWARE PENJAGA PINTU ---
const isAdmin = (req, res, next) => {
    if (req.session.adminId) {
        next();
    } else {
        res.redirect('/admin/login');
    }
};

const ATLANTIC_BASE_URL = 'https://atlantich2h.com';
const API_KEY = process.env.ATLANTIC_API_KEY || 'rviGKdaMWIqqG3bYYQGKTHioqOwkEw4hu1s4dPJrootJmQmhzfywCQ48sEe3b6fph8S59gtQKpRk3iXcAXe9L2eGOFqrsBsz5rkJ';

const requestHeaders = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'Atlantic-Vercel/5.0' 
};

// ==========================
// ROUTE VIEW (USER SIDE)
// ==========================

// Halaman Utama: Menampilkan Banner, Flash Sale, Populer, dan Semua Brand
/*
app.get('/', async (req, res) => {
    try {
        const banners = await Banner.find().sort({ created_at: -1 });
        const flashSales = await FlashSale.find({ is_active: true, end_date: { $gt: new Date() } });
        const brands = await Brand.find({ status: 'active' }).sort({ name: 1 });
        const config = await Config.findOne({ key: 'qris_settings' }) || {};

        res.render('user/indexx', { banners, flashSales, brands, config });
    } catch (e) { res.status(500).send("Database Error"); }
});
*/
app.get('/', async (req, res) => {
    try {
        const banners = await Banner.find().sort({ created_at: -1 });
        const flashSales = await FlashSale.find({ is_active: true, end_date: { $gt: new Date() } });
        const brands = await Brand.find({ status: 'active' }).sort({ index: 1 });
        
        // Ambil config, jika tidak ada buat default
        let config = await Config.findOne({ key: 'qris_settings' });
        if (!config) {
            config = await Config.create({ 
                key: 'qris_settings', 
                shop_name: "Lana Store", 
                meta_description: "Topup Murah 24 Jam",
                title_popular: "POPULER SEKARANG!",
                title_flash_sale: "PASTI TER-MURAAHH"
            });
        }

        res.render('user/indexx', { banners, flashSales, brands, config });
    } catch (e) { res.status(500).send("Database Error"); }
});

/*

// Halaman Detail Game Dinamis
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

*/

// Halaman Detail Game Dinamis: /id/free-fire
app.get('/id/:slug', async (req, res) => {
    try {
        const brand = await Brand.findOne({ slug: req.params.slug, status: 'active' });
        if (!brand) return res.status(404).send("Layanan tidak ditemukan");

        // Ambil produk yang dikaitkan dengan brand ini
        const products = await Service.find({ 
            service_id: { $in: brand.services },
            is_active: true,
            status_api: { $ne: 'empty' }
        }).sort({ price_sell: 1 });

        // --- TAMBAHKAN BARIS INI ---
        let config = await Config.findOne({ key: 'qris_settings' });
        if (!config) {
            config = { 
                shop_name: "Lana Store", 
                meta_description: "Topup Murah 24 Jam" 
            };
        }
        // ---------------------------

        // Kirim 'config' ke dalam render
        res.render('user/detail-game', { brand, products, config }); 
    } catch (e) { 
        console.error(e);
        res.status(500).send("Server Error"); 
    }
});
// Halaman Pembayaran (QRIS)
app.get('/transaction/:deposit_id', async (req, res) => {
    const depositId = req.params.deposit_id;
    try {
        const tr = await Transaction.findOne({ deposit_id: depositId });
        if (!tr) return res.status(404).send("Transaksi tidak ditemukan");
        
        // Render EJS Payment dan kirim data transaksi
        res.render('user/payment', { tr: tr });
    } catch (error) { res.status(500).send('Server Error'); }
});

app.get('/search', async (req, res) => {
    try {
        const config = await Config.findOne({ key: 'qris_settings' }) || { shop_name: "Lana Store" };
        res.render('user/search', { config });
    } catch (e) {
        res.status(500).send("Server Error");
    }
});
// app.get('/search', (req, res) => res.render('user/search'));
app.get('/faq', (req, res) => res.render('user/faq'));

// ==========================
// ROUTE VIEW (ADMIN SIDE)
// ==========================
app.get('/admin/login', (req, res) => {
    if(req.session.adminId) return res.redirect('/admin/dashboard');
    res.render('admin/login');
});
app.get('/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
});
app.get('/admin/layanan', isAdmin, (req, res) => res.render('admin/kelola-layanan', { currentPage: 'layanan' }));
app.get('/admin/voucher', isAdmin, (req, res) => res.render('admin/create-voucher', { currentPage: 'voucher' }));
app.get('/admin/pengaturan', isAdmin, (req, res) => res.render('admin/pengaturan', { currentPage: 'pengaturan' }));
app.get('/admin/brand', isAdmin, (req, res) => res.render('admin/brand-manage', { currentPage: 'brand' }));
app.get('/admin/banner', isAdmin, (req, res) => res.render('admin/banner-manage', { currentPage: 'banner' }));
app.get('/admin/flash-sale', isAdmin, (req, res) => res.render('admin/flash-sale-manage', { currentPage: 'flashsale' }));
app.get('/admin/dashboard', isAdmin, async (req, res) => {
    try {
        const now = new Date();
        const startOfToday = new Date(now.setHours(0,0,0,0));
        const startOfYesterday = new Date(new Date().setDate(new Date().getDate() - 1));
        startOfYesterday.setHours(0,0,0,0);
        const endOfYesterday = new Date(startOfToday);
        
        const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

        // Fungsi pembantu untuk hitung Statistik
        const getStats = async (startDate, endDate = new Date()) => {
            const result = await Transaction.aggregate([
                { $match: { status: 'success', created_at: { $gte: startDate, $lt: endDate } } },
                { $group: {
                    _id: null,
                    count: { $sum: 1 },
                    omset: { $sum: "$amount" },
                    profit: { $sum: { $subtract: ["$amount", "$base_price"] } }
                }}
            ]);
            return result[0] || { count: 0, omset: 0, profit: 0 };
        };

        // Jalankan semua perhitungan
        const today = await getStats(startOfToday);
        const yesterday = await getStats(startOfYesterday, endOfYesterday);
        const thisMonth = await getStats(startOfThisMonth);
        const lastMonth = await getStats(startOfLastMonth, endOfLastMonth);

        // Ambil 10 Produk Terlaris
        const topProducts = await Transaction.aggregate([
            { $match: { status: 'success' } },
            { $group: { _id: "$item_name", total: { $sum: 1 } } },
            { $sort: { total: -1 } },
            { $limit: 10 }
        ]);

        res.render('admin/dashboard', { 
            currentPage: 'dashboard',
            stats: { today, yesterday, thisMonth, lastMonth },
            topProducts
        });
    } catch (e) {
        res.status(500).send("Error loading dashboard: " + e.message);
    }
});


// --- LOGIKA LOGIN ---
app.post('/admin/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        // Mencari di koleksi AdminLog
        const admin = await AdminLog.findOne({ username });

        if (admin && await bcrypt.compare(password, admin.password)) {
            req.session.adminId = admin._id;
            res.json({ status: true, message: "Login Berhasil" });
        } else {
            res.json({ status: false, message: "Username atau Password Salah" });
        }
    } catch (e) {
        res.status(500).json({ status: false, message: "Server Error" });
    }
});


// Halaman Checklist Layanan untuk Brand
app.get('/admin/brand/services/:id', async (req, res) => {
    try {
        const brandData = await Brand.findById(req.params.id);
        if (!brandData) return res.status(404).send("Brand tidak ditemukan");
        
        // Di sini kita WAJIB mengirim variabel 'brand' agar EJS tidak error
        res.render('admin/brand-services', { 
            currentPage: 'brand', 
            brand: brandData 
        });
    } catch (e) {
        res.status(500).send("Server Error");
    }
});



// ─── Route: Validasi ID Game (Proxy) ──────────────────────────────
app.get('/api/validasi/:code', async (req, res) => {
    const { code } = req.params;
    const { id, server } = req.query;

    if (!id) return res.status(400).json({ success: false, message: 'ID game wajib diisi' });

    try {
        // Menggunakan axios agar seragam dengan request lainnya
        const url = `https://api.isan.eu.org/nickname/${code}?id=${id}${server ? `&server=${server}` : ''}`;
        const response = await axios.get(url);
        const data = response.data;

        // Logika pengecekan nickname (berdasarkan struktur response api.isan.eu.org)
        if (data.success !== false && (data.name || data.nickname)) {
            res.json({ 
                success: true, 
                nickname: data.name || data.nickname 
            });
        } else {
            res.json({ success: false, message: 'ID tidak ditemukan' });
        }
    } catch (e) {
        res.status(500).json({ success: false, message: 'Gagal validasi: ' + e.message });
    }
});

// ==========================
// API: BRAND & REORDER
// ==========================
app.get('/api/admin/brands', async (req, res) => {
    const brands = await Brand.find().sort({ index: 1 });
    res.json({ status: true, data: brands });
});

app.post('/api/admin/brands', async (req, res) => {
    try {
        const count = await Brand.countDocuments();
        const newBrand = new Brand({ ...req.body, index: count });
        await newBrand.save();
        res.json({ status: true, message: "Brand Berhasil Ditambahkan" });
    } catch (e) { res.status(400).json({ status: false, message: "Gagal: Slug duplikat" }); }
});

app.put('/api/admin/brands/reorder', async (req, res) => {
    try {
        const { order } = req.body; 
        const ops = order.map((id, idx) => ({
            updateOne: { filter: { _id: id }, update: { $set: { index: idx } } }
        }));
        await Brand.bulkWrite(ops);
        res.json({ status: true });
    } catch (e) { res.status(500).json({ status: false }); }
});

app.put('/api/admin/brands/popular/:id', async (req, res) => {
    await Brand.findByIdAndUpdate(req.params.id, { is_popular: req.body.is_popular });
    res.json({ status: true });
});

app.delete('/api/admin/brands/:id', async (req, res) => {
    await Brand.findByIdAndDelete(req.params.id);
    res.json({ status: true });
});

// --- RUTE TAMBAHAN UNTUK EDIT BRAND ---
app.get('/api/admin/brands/:id', async (req, res) => {
    try {
        const brand = await Brand.findById(req.params.id);
        res.json({ status: true, data: brand });
    } catch (e) { res.status(404).json({ status: false }); }
});

app.put('/api/admin/brands/:id', async (req, res) => {
    try {
        await Brand.findByIdAndUpdate(req.params.id, req.body);
        res.json({ status: true, message: "Brand berhasil diperbarui" });
    } catch (e) { res.status(500).json({ status: false }); }
});
// --------------------------------------

app.put('/api/admin/brands/:id/services', async (req, res) => {
    try {
        await Brand.findByIdAndUpdate(req.params.id, { services: req.body.services });
        res.json({ status: true, message: "Daftar layanan berhasil diperbarui" });
    } catch (e) { res.status(500).json({ status: false }); }
});

// ==========================
// API: BANNER & FLASH SALE
// ==========================
app.get('/api/admin/banners', async (req, res) => {
    const data = await Banner.find().sort({ created_at: -1 });
    res.json({ status: true, data });
});

app.post('/api/admin/banners', async (req, res) => {
    const newB = new Banner(req.body);
    await newB.save();
    res.json({ status: true });
});

app.delete('/api/admin/banners/:id', async (req, res) => {
    await Banner.findByIdAndDelete(req.params.id);
    res.json({ status: true });
});

app.get('/api/admin/flash-sales', async (req, res) => {
    const data = await FlashSale.find().sort({ end_date: 1 });
    res.json({ status: true, data });
});

app.post('/api/admin/flash-sales', async (req, res) => {
    const newFS = new FlashSale(req.body);
    await newFS.save();
    res.json({ status: true });
});

app.delete('/api/admin/flash-sales/:id', async (req, res) => {
    await FlashSale.findByIdAndDelete(req.params.id);
    res.json({ status: true });
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
    try {
        await Config.findOneAndUpdate({ key: 'qris_settings' }, req.body, { upsert: true });
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

app.get('/api/admin/all-services', async (req, res) => {
    const services = await Service.find({}, 'service_id name brand category price_sell');
    res.json({ status: true, data: services });
});

// ==========================
// API: VOUCHER (MANAGEMENT)
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
        if (!v || v.used_count >= v.quota || amount < v.min_order) return res.json({ status: false, message: "Voucher Tidak Berlaku" });
        let discount = v.type === 'percentage' ? (amount * v.value / 100) : v.value;
        res.json({ status: true, discount, code: v.code });
    } catch (e) { res.status(500).json({ status: false }); }
});

app.get('/api/services', async (req, res) => {
    try {
        const data = await Service.find({ is_active: true, status_api: { $ne: 'empty' } }).sort({ category: 1, name: 1 });
        res.json({ status: true, data });
    } catch (e) { res.status(500).json({ status: false }); }
});
/*
app.post('/api/create-payment', async (req, res) => {
    const { service_id, target, whatsapp, voucher_code, email } = req.body;
    try {
        const service = await Service.findOne({ service_id, is_active: true });
        if (!service) return res.json({ status: false, message: "Layanan Offline" });

        let conf = await Config.findOne({ key: 'qris_settings' }) || { admin_fee: 700, tax_percent: 1.4 };
        let sellPrice = service.price_sell;
        let usedVoucher = null;

        if (voucher_code) {
            const v = await Voucher.findOne({ code: voucher_code.toUpperCase(), is_active: true });
            if (v && v.used_count < v.quota && sellPrice >= v.min_order) {
                sellPrice -= v.type === 'percentage' ? (sellPrice * v.value / 100) : v.value;
                usedVoucher = v.code;
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
                meta: { code: service.service_id, target, applied_voucher: usedVoucher }
            });
            await tr.save();
            res.json({ status: true, redirect_url: `/transaction/${depositId}` });
        } else { res.json({ status: false, message: depoRes.data.message }); }
    } catch (e) { res.status(500).json({ status: false, message: "Server Error" }); }
});
*/

app.post('/api/create-payment', async (req, res) => {
    // Ambil target1 dan target2 dari body
    const { service_id, target1, target2, whatsapp, voucher_code, email } = req.body;
    
    try {
        const service = await Service.findOne({ service_id, is_active: true });
        if (!service) return res.json({ status: false, message: "Layanan Offline" });

        // Cari Brand dari produk ini untuk cek format target
        const brand = await Brand.findOne({ services: service_id });
        
        // --- LOGIKA PARSING TARGET (Gasken!) ---
        let finalTarget = target1; // Default hanya ID
        
        if (target2) {
            // Jika nama brand mengandung "Mobile Legends"
            if (brand &&  (brand.name.toLowerCase().includes('mobile legends')  || brand.slug.includes('mobile-legends'))) {
                finalTarget = `${target1}|${target2}`; // Format: 123456|1234
            } else {
                finalTarget = `${target1}${target2}`;  // Format: Gabung (1234561234)
            }
        }
        // ----------------------------------------

        let conf = await Config.findOne({ key: 'qris_settings' }) || { admin_fee: 700, tax_percent: 1.4 };
        let sellPrice = service.price_sell;
        let usedVoucher = null;

        if (voucher_code) {
            const v = await Voucher.findOne({ code: voucher_code.toUpperCase(), is_active: true });
            if (v && v.used_count < v.quota && sellPrice >= v.min_order) {
                sellPrice -= v.type === 'percentage' ? (sellPrice * v.value / 100) : v.value;
                usedVoucher = v.code;
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
                target: finalTarget, // Simpan target yang sudah diformat ke DB
                whatsapp, 
                status: 'pending',
                email: email || 'customer@lanastore.com',
                meta: { 
                    code: service.service_id, 
                    target: finalTarget, // Ini yang akan ditembak ke API Atlantic saat sukses
                    applied_voucher: usedVoucher 
                }
            });
            await tr.save();
            res.json({ status: true, redirect_url: `/transaction/${depositId}` });
        } else {
            res.json({ status: false, message: depoRes.data.message });
        }
    } catch (e) { 
        console.error(e);
        res.status(500).json({ status: false, message: "Server Error" }); 
    }
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
            const currentTr = await Transaction.findOne({ deposit_id });
            
            // Kurangi Kuota Voucher jika ada
            if (currentTr.meta && currentTr.meta.applied_voucher) {
                await Voucher.updateOne({ code: currentTr.meta.applied_voucher }, { $inc: { used_count: 1 } });
                await Transaction.updateOne({ deposit_id }, { $set: { "meta.applied_voucher": null } });
            }

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
