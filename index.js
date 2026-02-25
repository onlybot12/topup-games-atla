require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const qs = require('querystring');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const connectDB = require('./config/database');
const sendWag = require('./config/wa-gateway');
const AdminLog = require('./models/AdminLog');
const Transaction = require('./models/Transaction');
const Service = require('./models/Service');
const Voucher = require('./models/Voucher');
const Config = require('./models/Config');
const Brand = require('./models/Brand');
const Banner = require('./models/Banner'); // Tambahan Model
const FlashSale = require('./models/FlashSale'); // Tambahan Model
const Popup = require('./models/Popup');
const CategoryProfit = require('./models/CategoryProfit');

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

const isAdminn = (req, res, next) => {
    if (req.session.adminId) {
        next();
    } else {
        res.redirect('/admin/login');
    }
};


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
        const popups = await Popup.find({ is_active: true });
        res.render('user/indexx', { banners, flashSales, brands, config, popups });
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
        let config = await Config.findOne({ key: 'qris_settings' });
        if (!config) {
            config = { 
                shop_name: "Lana Store", 
                meta_description: "Topup Murah 24 Jam" 
            };
        }
        // Render EJS Payment dan kirim data transaksi
        res.render('user/payment', { tr: tr, config: config });
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
// Route View: Smart Markup Kategori
app.get('/admin/profit-kategori', isAdmin, (req, res) => {
    res.render('admin/profit-kategori', { currentPage: 'markup' });
});
app.get('/admin/layanan', isAdmin, (req, res) => res.render('admin/kelola-layanan', { currentPage: 'layanan' }));
app.get('/admin/voucher', isAdmin, (req, res) => res.render('admin/create-voucher', { currentPage: 'voucher' }));
app.get('/admin/pengaturan', isAdmin, (req, res) => res.render('admin/pengaturan', { currentPage: 'pengaturan' }));
app.get('/admin/popup', isAdmin, (req, res) => res.render('admin/popup-manage', { currentPage: 'popup' }));
app.get('/admin/brand', isAdmin, (req, res) => res.render('admin/brand-manage', { currentPage: 'brand' }));
app.get('/admin/banner', isAdmin, (req, res) => res.render('admin/banner-manage', { currentPage: 'banner' }));
app.get('/admin/flash-sale', isAdmin, (req, res) => res.render('admin/flash-sale-manage', { currentPage: 'flashsale' }));
app.get('/admin/vendor', isAdmin, (req, res) => res.render('admin/vendor', { currentPage: 'vendor' }));
app.get('/admin/transaksi', isAdmin, (req, res) => {
    res.render('admin/transaksi', { currentPage: 'transaksi' });
});
app.get('/admin/dashboard', isAdmin, async (req, res) => {
    try {
        const now = new Date();
        const startOfToday = new Date(new Date().setHours(0,0,0,0));
        const startOfYesterday = new Date(new Date().setDate(new Date().getDate() - 1));
        startOfYesterday.setHours(0,0,0,0);
        const endOfYesterday = new Date(startOfToday);
        
        const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

        // 1. Ambil Pengaturan Biaya dari Database agar hitungan dinamis
        const conf = await Config.findOne({ key: 'qris_settings' }) || { tax_percent: 1.6, vendor_fee_fixed: 200 };
        const multiplier = (100 - conf.tax_percent) / 100; // Contoh: 0.984 jika pajak 1.6%
        const fixedFee = conf.vendor_fee_fixed; // Contoh: 200

        // Fungsi pembantu untuk hitung Statistik
        const getStats = async (startDate, endDate = new Date()) => {
            const result = await Transaction.aggregate([
                { $match: { status: 'success', created_at: { $gte: startDate, $lt: endDate } } },
                { $group: {
                    _id: null,
                    count: { $sum: 1 },
                    omset: { $sum: "$amount" }, // Total yang dibayar user (Omset kotor)
                    
                    // --- RUMUS PROFIT BERSIH REAL ---
                    // Uang yang Anda terima = (Bayaran User * 0.984) - 200
                    // Profit = Uang yang Anda terima - Harga Modal Atlantic
                    profit: { 
                        $sum: { 
                            $subtract: [
                                { 
                                    $subtract: [
                                        { $multiply: ["$amount", multiplier] }, 
                                        fixedFee 
                                    ] 
                                }, 
                                "$base_price" 
                            ] 
                        } 
                    }
                }}
            ]);
            
            const data = result[0] || { count: 0, omset: 0, profit: 0 };
            return {
                count: data.count,
                omset: Math.round(data.omset),
                profit: Math.round(data.profit) // Dibulatkan agar tidak ada koma desimal
            };
        };

        // Jalankan semua perhitungan (Menggunakan Promise.all agar lebih cepat/Anti-Lag)
        const [today, yesterday, thisMonth, lastMonth] = await Promise.all([
            getStats(startOfToday),
            getStats(startOfYesterday, endOfYesterday),
            getStats(startOfThisMonth),
            getStats(startOfLastMonth, endOfLastMonth)
        ]);

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
        console.error("Dashboard Error:", e.message);
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
app.get('/admin/brand/services/:id', isAdmin, async (req, res) => {
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


app.get('/api/admin/popups', isAdmin, async (req, res) => {
    const data = await Popup.find().sort({ created_at: -1 });
    res.json({ status: true, data });
});

app.post('/api/admin/popups', isAdmin, async (req, res) => {
    const newPopup = new Popup(req.body);
    await newPopup.save();
    res.json({ status: true });
});

app.delete('/api/admin/popups/:id', isAdmin, async (req, res) => {
    await Popup.findByIdAndDelete(req.params.id);
    res.json({ status: true });
});



/*
// --- API: STATISTIK TRANSAKSI (CARD ATAS) ---
app.get('/api/admin/transactions/stats', isAdmin, async (req, res) => {
    try {
        const stats = await Transaction.aggregate([
            {
                $group: {
                    _id: "$status",
                    total: { $sum: 1 }
                }
            }
        ]);
        
        const data = { total: 0, success: 0, pending: 0, failed: 0 };
        stats.forEach(s => {
            if(s._id === 'success') data.success = s.total;
            else if(s._id === 'pending') data.pending = s.total;
            else if(s._id === 'failed') data.failed = s.total;
            data.total += s.total;
        });
        
        res.json({ status: true, data });
    } catch (e) { res.status(500).json({ status: false }); }
});
*/

// ─── API: STATISTIK TRANSAKSI + PROFIT HARI INI ──────────────────
app.get('/api/admin/transactions/stats', isAdmin, async (req, res) => {
    try {
        const startOfToday = new Date();
        startOfToday.setHours(0,0,0,0);

        // Hitung Status General
        const stats = await Transaction.aggregate([
            { $group: { _id: "$status", total: { $sum: 1 } } }
        ]);

        // Hitung Profit Hari Ini (Berdasarkan Pajak MDR di Config)
        const conf = await Config.findOne({ key: 'qris_settings' }) || { tax_percent: 1.6, vendor_fee_fixed: 200 };
        const multiplier = (100 - conf.tax_percent) / 100;

        const profitToday = await Transaction.aggregate([
            { $match: { status: 'success', created_at: { $gte: startOfToday } } },
            { $group: {
                _id: null,
                total: { $sum: { $subtract: [ { $subtract: [ { $multiply: ["$amount", multiplier] }, conf.vendor_fee_fixed ] }, "$base_price" ] } }
            }}
        ]);

        const result = { total: 0, success: 0, pending: 0, failed: 0, profit_today: profitToday[0]?.total || 0 };
        stats.forEach(s => {
            if(s._id === 'success') result.success = s.total;
            else if(s._id === 'pending') result.pending = s.total;
            else if(s._id === 'failed') result.failed = s.total;
            result.total += s.total;
        });

        res.json({ status: true, data: result });
    } catch (e) { res.status(500).json({ status: false }); }
});

// ─── API: CEK MANUAL (FORCE CHECK) ──────────────────────────────
app.post('/api/admin/transactions/check-manual', isAdmin, async (req, res) => {
    const { deposit_id } = req.body;
    try {
        // Panggil fungsi internal check status (gunakan logic yang sama dengan user)
        // Kita cukup beritahu server untuk menjalankan pengecekan ulang
        const tr = await Transaction.findOne({ deposit_id });
        if(!tr) return res.json({ status: false, message: "Trx tidak ada" });
        
        // Kirim request ke endpoint check-status internal kita
        const response = await axios.post(`https://maulanastore.my.id/api/check-status`, {
            deposit_id: tr.deposit_id,
            meta: tr.meta
        });
        
        res.json({ status: true, message: "Status diperbarui!", data: response.data });
    } catch (e) { res.status(500).json({ status: false, message: e.message }); }
});

// ─── API: EXPORT CSV ──────────────────────────────────────────
app.get('/api/admin/transactions/export', isAdmin, async (req, res) => {
    try {
        const data = await Transaction.find({ status: 'success' }).sort({ created_at: -1 });
        let csv = "Tanggal,OrderID,Item,Target,Whatsapp,Harga,Profit\n";
        
        const conf = await Config.findOne({ key: 'qris_settings' }) || { tax_percent: 1.6, vendor_fee_fixed: 200 };
        const multiplier = (100 - conf.tax_percent) / 100;

        data.forEach(t => {
            const profit = Math.round(((t.amount * multiplier) - conf.vendor_fee_fixed) - t.base_price);
            csv += `${t.created_at.toISOString()},${t.order_id},${t.item_name},${t.target},${t.whatsapp},${t.amount},${profit}\n`;
        });

        res.header('Content-Type', 'text/csv');
        res.attachment(`Laporan-LanaStore-${Date.now()}.csv`);
        res.send(csv);
    } catch (e) { res.status(500).send("Export Gagal"); }
});

// --- API: LIST TRANSAKSI (SERVER-SIDE DATATABLES) ---
app.get('/api/admin/transactions/list', isAdmin, async (req, res) => {
    try {
        let { draw, start, length, search } = req.query;
        start = parseInt(start) || 0;
        length = parseInt(length) || 10;
        let query = {};

        if (search && search.value) {
            query = {
                $or: [
                    { order_id: { $regex: search.value, $options: 'i' } },
                    { whatsapp: { $regex: search.value, $options: 'i' } },
                    { target: { $regex: search.value, $options: 'i' } },
                    { item_name: { $regex: search.value, $options: 'i' } }
                ]
            };
        }

        const totalRecords = await Transaction.countDocuments();
        const filteredRecords = await Transaction.countDocuments(query);
        const data = await Transaction.find(query)
            .sort({ created_at: -1 })
            .skip(start)
            .limit(length);

        res.json({
            draw: parseInt(draw),
            recordsTotal: totalRecords,
            recordsFiltered: filteredRecords,
            data: data
        });
    } catch (e) { res.status(500).json({ status: false }); }
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


// --- API: AMBIL PROFIL ATLANTIC VENDOR ---
app.post("/api/admin/profile-atla", isAdmin, async (req, res) => {
    try {
        const response = await axios.post(
            "https://atlantich2h.com/get_profile",
            qs.stringify({ api_key: API_KEY }), // 
            { headers: requestHeaders }
        );

        const extData = response.data;

        if (extData.status === "true" || extData.status === true) {
            return res.json({
                success: true,
                profile: {
                    nama: extData.data.name,
                    user: extData.data.username,
                    email: extData.data.email,
                    hp: extData.data.phone,
                    saldo: parseFloat(extData.data.balance),
                    status: extData.data.status,
                },
            });
        } else {
            res.json({ success: false, message: extData.message || "Gagal mengambil data" });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Koneksi API Gagal" });
    }
});

// ==========================
// API: BRAND & REORDER
// ==========================
app.get('/api/admin/brands', async (req, res) => {
    const brands = await Brand.find().sort({ index: 1 });
    res.json({ status: true, data: brands });
});

app.post('/api/admin/brands', isAdmin, async (req, res) => {
    try {
        const count = await Brand.countDocuments();
        const newBrand = new Brand({ ...req.body, index: count });
        await newBrand.save();
        res.json({ status: true, message: "Brand Berhasil Ditambahkan" });
    } catch (e) { res.status(400).json({ status: false, message: "Gagal: Slug duplikat" }); }
});

app.put('/api/admin/brands/reorder', isAdmin, async (req, res) => {
    try {
        const { order } = req.body; 
        const ops = order.map((id, idx) => ({
            updateOne: { filter: { _id: id }, update: { $set: { index: idx } } }
        }));
        await Brand.bulkWrite(ops);
        res.json({ status: true });
    } catch (e) { res.status(500).json({ status: false }); }
});

app.put('/api/admin/brands/popular/:id', isAdmin, async (req, res) => {
    await Brand.findByIdAndUpdate(req.params.id, { is_popular: req.body.is_popular });
    res.json({ status: true });
});

app.delete('/api/admin/brands/:id', isAdmin, async (req, res) => {
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

app.put('/api/admin/brands/:id/services', isAdmin, async (req, res) => {
    try {
        await Brand.findByIdAndUpdate(req.params.id, { services: req.body.services });
        res.json({ status: true, message: "Daftar layanan berhasil diperbarui" });
    } catch (e) { res.status(500).json({ status: false }); }
});


// Ambil semua settingan profit kategori
app.get('/api/admin/category-profits', isAdmin, async (req, res) => {
    const data = await CategoryProfit.find();
    res.json({ status: true, data });
});

// Simpan atau Update profit kategori
app.post('/api/admin/category-profits', isAdmin, async (req, res) => {
    const { category_name, type, value } = req.body;
    try {
        await CategoryProfit.findOneAndUpdate(
            { category_name },
            { type, value: parseFloat(value) },
            { upsert: true }
        );
        res.json({ status: true, message: "Profit kategori diperbarui" });
    } catch (e) { res.status(500).json({ status: false }); }
});

// Ambil daftar kategori unik yang ada di database layanan (buat referensi admin)
app.get('/api/admin/get-unique-categories', isAdmin, async (req, res) => {
    const categories = await Service.distinct('category');
    res.json({ status: true, data: categories });
});

// API: Terapkan profit per KATEGORI spesifik
app.put('/api/admin/apply-markup', isAdmin, async (req, res) => {
    const { category } = req.body; // Ambil nama kategori dari body

    try {
        // 1. Ambil aturan profit untuk kategori tersebut
        const profitSetting = await CategoryProfit.findOne({ category_name: category });
        
        if (!profitSetting) {
            return res.json({ status: false, message: "Aturan profit untuk kategori ini belum di-set!" });
        }

        // 2. Ambil semua layanan yang masuk dalam kategori ini
        const services = await Service.find({ category: category });

        if (services.length === 0) {
            return res.json({ status: false, message: "Tidak ada produk dalam kategori ini." });
        }

        // 3. Siapkan operasi update massal
        const operations = services.map(item => {
            const modal = item.price_original;
            let jual = modal;

            if (profitSetting.type === 'percentage') {
                jual = modal + (modal * profitSetting.value / 100);
            } else {
                jual = modal + profitSetting.value;
            }

            // Bulatkan ke 100 terdekat ke atas
            jual = Math.ceil(jual / 100) * 100;

            return {
                updateOne: {
                    filter: { _id: item._id },
                    update: { $set: { price_sell: jual, updated_at: new Date() } }
                }
            };
        });

        await Service.bulkWrite(operations);

        res.json({ 
            status: true, 
            message: `Berhasil update ${services.length} produk di kategori ${category}!` 
        });
    } catch (e) {
        res.status(500).json({ status: false, message: e.message });
    }
});

// ==========================
// API: BANNER & FLASH SALE
// ==========================
app.get('/api/admin/banners', isAdmin, async (req, res) => {
    const data = await Banner.find().sort({ created_at: -1 });
    res.json({ status: true, data });
});

app.post('/api/admin/banners', isAdmin, async (req, res) => {
    const newB = new Banner(req.body);
    await newB.save();
    res.json({ status: true });
});

app.delete('/api/admin/banners/:id', isAdmin, async (req, res) => {
    await Banner.findByIdAndDelete(req.params.id);
    res.json({ status: true });
});

app.get('/api/admin/flash-sales', isAdmin, async (req, res) => {
    const data = await FlashSale.find().sort({ end_date: 1 });
    res.json({ status: true, data });
});

app.post('/api/admin/flash-sales', isAdmin, async (req, res) => {
    const newFS = new FlashSale(req.body);
    await newFS.save();
    res.json({ status: true });
});

app.delete('/api/admin/flash-sales/:id', isAdmin, async (req, res) => {
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

app.put('/api/admin/config', isAdmin, async (req, res) => {
    try {
        await Config.findOneAndUpdate({ key: 'qris_settings' }, req.body, { upsert: true });
        res.json({ status: true });
    } catch (e) { res.status(500).json({ status: false }); }
});

// ==========================
// API: LAYANAN (SYNC & DATATABLES)
// ==========================
app.post('/api/admin/sync-services', isAdmin, async (req, res) => {
    const { profit } = req.body;
    const profitPercentFallback = parseFloat(profit) || 0; // Backup jika kategori belum di-set profitnya

    try {
        // 1. Ambil semua aturan profit kategori dari database lokal
        const profitSettings = await CategoryProfit.find();
        const profitMap = {};
        profitSettings.forEach(s => { 
            profitMap[s.category_name] = s; 
        });

        // 2. Ambil data layanan terbaru dari API Atlantic
        const response = await axios.post(`${ATLANTIC_BASE_URL}/layanan/price_list`,
            qs.stringify({ api_key: API_KEY, type: 'prabayar' }), 
            { headers: requestHeaders, timeout: 60000 }
        );

        if (response.data.status) {
            const services = response.data.data;

            const operations = services.map(item => {
                const modal = parseInt(item.price) || 0;
                let jual = modal;

                // 3. LOGIKA SMART MARKUP (Cek Profit per Kategori)
                const setting = profitMap[item.category];

                if (setting) {
                    // Jika kategori ditemukan di database CategoryProfit
                    if (setting.type === 'percentage') {
                        jual = modal + (modal * setting.value / 100);
                    } else {
                        jual = modal + setting.value;
                    }
                } else {
                    // Jika kategori BELUM PERNAH di-set profitnya, pakai profit global dari input header
                    jual = modal + (modal * profitPercentFallback / 100);
                }

                // 4. Bulatkan ke 100 terdekat ke atas (contoh: 10.120 -> 10.200)
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

            // 5. Eksekusi update massal ke MongoDB
            await Service.bulkWrite(operations);
            res.json({ 
                status: true, 
                message: `Sync ${services.length} data berhasil dengan Smart Markup!` 
            });
        } else {
            res.json({ status: false, message: response.data.message });
        }
    } catch (e) { 
        res.status(500).json({ status: false, message: e.message }); 
    }
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

app.put('/api/admin/services/:id', isAdmin, async (req, res) => {
    try {
        const { price_sell, is_active } = req.body;
        await Service.findByIdAndUpdate(req.params.id, { price_sell, is_active });
        res.json({ status: true });
    } catch (e) { res.status(500).json({ status: false }); }
});

app.delete('/api/admin/delete-services', isAdmin, async (req, res) => {
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

app.post('/api/admin/vouchers', isAdmin, async (req, res) => {
    try {
        const v = new Voucher(req.body);
        await v.save();
        res.json({ status: true });
    } catch (e) { res.status(400).json({ status: false, message: "Kode Duplikat" }); }
});

app.delete('/api/admin/vouchers/:id', isAdmin, async (req, res) => {
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
    // 1. Ambil input dari body
    const { service_id, target1, target2, whatsapp, voucher_code, email } = req.body;

    // --- 🛡️ PROTEKSI ANTI XSS & VALIDASI INPUT ---
    const safePattern = /^[a-zA-Z0-9@._\-|() ]+$/;
    const numericPattern = /^[0-9]+$/;

    if ((target1 && !safePattern.test(target1)) || (target2 && !safePattern.test(target2))) {
        console.error("⚠️ DETEKSI INPUT BERBAHAYA:", { target1, target2 });
        return res.status(400).json({ 
            status: false, 
            message: "Karakter tidak diizinkan! Gunakan format ID/Username yang benar." 
        });
    }

    // --- 📱 VALIDASI & BERSIHKAN NOMOR WHATSAPP ---
    let cleanWA = whatsapp ? whatsapp.replace(/[^0-9]/g, '') : '';
    if (!cleanWA || !numericPattern.test(cleanWA) || cleanWA.length < 9) {
        return res.status(400).json({ 
            status: false, 
            message: "Nomor WhatsApp tidak valid! Harus berupa angka." 
        });
    }

    if (cleanWA.startsWith('0')) {
        cleanWA = '62' + cleanWA.slice(1);
    }
    // ---------------------------------------------
    
    try {
        const service = await Service.findOne({ service_id, is_active: true });
        if (!service) return res.json({ status: false, message: "Layanan Offline" });

        // Cari Brand untuk menentukan format target (ML vs Game Lain)
        const brand = await Brand.findOne({ services: service_id });
        
        // --- ⚙️ LOGIKA PARSING TARGET (Gasken!) ---
        let finalTarget = target1; 
        if (target2) {
            if (brand && (brand.name.toLowerCase().includes('mobile legends') || brand.slug.includes('mobile-legends'))) {
                finalTarget = `${target1}|${target2}`; // Format khusus ML
            } else {
                finalTarget = `${target1}${target2}`;  // Format Game Lain (Gabung)
            }
        }

        // --- 💰 KALKULASI BIAYA DINAMIS DARI DATABASE ---
        // Mengambil: admin_fee (Cuan Anda), tax_percent (MDR 1.6%), vendor_fee_fixed (Rp 200)
        let conf = await Config.findOne({ key: 'qris_settings' }) || { 
            admin_fee: 700, 
            tax_percent: 1.6, 
            vendor_fee_fixed: 200 
        };

        let sellPrice = service.price_sell;
        let usedVoucher = null;

        // Validasi Voucher
        if (voucher_code) {
            const v = await Voucher.findOne({ code: voucher_code.toUpperCase(), is_active: true });
            if (v && v.used_count < v.quota && sellPrice >= v.min_order) {
                let discount = v.type === 'percentage' ? (sellPrice * v.value / 100) : v.value;
                sellPrice -= discount;
                usedVoucher = v.code; 
            }
        }

        /**
         * RUMUS SAKTI (REVERSE CALCULATION):
         * Agar uang yang masuk ke saldo Anda utuh setelah dipotong pajak oleh vendor.
         * Multiplier: (100 - 1.6) / 100 = 0.984
         */
        const multiplier = (100 - (conf.tax_percent || 1.6)) / 100;
        const totalUangMasukHarapan = sellPrice + (conf.admin_fee || 700) + (conf.vendor_fee_fixed || 200);
        
        // Nominal yang harus di-scan pembeli
        const nominalBayar = Math.ceil(totalUangMasukHarapan / multiplier);
        
        const reff_id = `LAN-${Date.now()}`;

        // Request Deposit ke Atlantic
        const depoRes = await axios.post(`${ATLANTIC_BASE_URL}/deposit/create`,
            qs.stringify({ 
                api_key: API_KEY, 
                reff_id, 
                nominal: nominalBayar, 
                type: 'ewallet', 
                metode: 'qrisfast' 
            }), 
            { headers: requestHeaders });

        if (depoRes.data.status) {
            const depositId = depoRes.data.data.id;
            const tr = new Transaction({
                deposit_id: depositId,
                order_id: `LAN-${depositId}`,
                qr_image: depoRes.data.data.qr_image,
                amount: nominalBayar,
                base_price: service.price_original,
                item_name: service.name,
                target: finalTarget, 
                whatsapp: cleanWA,   
                status: 'pending',
                email: email || 'customer@lanastore.com',
                meta: { 
                    code: service.service_id, 
                    target: finalTarget, 
                    applied_voucher: usedVoucher 
                }
            });
            await tr.save();
            
            res.json({ status: true, redirect_url: `/transaction/${depositId}` });
        } else {
            res.json({ status: false, message: depoRes.data.message });
        }
    } catch (e) { 
        console.error("Error Create Payment:", e.message);
        res.status(500).json({ status: false, message: "Server Error" }); 
    }
});




app.post('/api/check-status', async (req, res) => {
    const { deposit_id, meta } = req.body;
    try {

        const statusRes = await axios.post(
            `${ATLANTIC_BASE_URL}/deposit/status`,
            qs.stringify({ api_key: API_KEY, id: deposit_id }),
            { headers: requestHeaders }
        );
        let status = statusRes.data.data.status;

        // Jika masih processing, coba paksa instant agar jadi success
        if (status === 'processing') {
            try {
                await axios.post(
                    `${ATLANTIC_BASE_URL}/deposit/instant`,
                    qs.stringify({ api_key: API_KEY, id: deposit_id, action: 'true' }),
                    { headers: requestHeaders }
                );
                status = 'success';
            } catch (e) {}
        }

        if (status === 'success') {
            const currentTr = await Transaction.findOne({ deposit_id });

            if (currentTr.meta && currentTr.meta.applied_voucher) {
                await Voucher.updateOne(
                    { code: currentTr.meta.applied_voucher },
                    { $inc: { used_count: 1 } }
                );
                await Transaction.updateOne(
                    { deposit_id },
                    { $set: { "meta.applied_voucher": null } }
                );
            }

            const buyRes = await axios.post(
                `${ATLANTIC_BASE_URL}/transaksi/create`,
                qs.stringify({
                    api_key: API_KEY,
                    code: meta.code,
                    target: meta.target,
                    reff_id: `TRX-${deposit_id}`  // ID referensi kita
                }),
                { headers: requestHeaders }
            );

            if (buyRes.data.status || buyRes.data.message?.includes('uplicate')) {

                const trxId = buyRes.data.data?.id;

                if (!trxId) {
                    console.error(`[CREATE] Tidak ada trxId dari response create deposit_id: ${deposit_id}`);
                    await Transaction.updateOne(
                        { deposit_id },
                        { $set: { status: 'pending_delivery', sn: 'Diproses', updated_at: new Date() } }
                    );
                    return res.json({ status: true, state: 'pending_delivery', sn: 'Diproses', message: 'Produk sedang diproses.' });
                }

                // Simpan trxId ke DB untuk keperluan polling berikutnya
                await Transaction.updateOne({ deposit_id }, { $set: { trx_id: trxId } });

                let deliverySN = buyRes.data.data?.sn || null;
                let deliveryState = 'pending_delivery';

                try {
                    const trxStatusRes = await axios.post(
                        `${ATLANTIC_BASE_URL}/transaksi/status`,
                        qs.stringify({
                            api_key: API_KEY,
                            id: trxId,       // ✅ ID dari response /transaksi/create
                            type: 'prabayar'
                        }),
                        { headers: requestHeaders }
                    );

                    const trxData = trxStatusRes.data?.data;

                    console.log(`[DELIVERY STATUS] trxId: ${trxId} | status: ${trxData?.status} | sn: ${trxData?.sn}`);

                    if (trxData?.status === 'success') {
                        deliveryState = 'success';
                        deliverySN = trxData?.sn || deliverySN;
                    } else if (trxData?.status === 'gagal') {
                        deliveryState = 'failed';
                    } else {
                        // Status lain: pending, processing, dll
                        deliveryState = 'pending_delivery';
                    }
                } catch (trxErr) {
                    console.error(`[DELIVERY STATUS] Gagal cek status pengiriman trxId: ${trxId} |`, trxErr.message);
                }

                // ==========================================
                // STEP 5: Update DB & kirim response
                // ==========================================
                if (deliveryState === 'success') {
                    await Transaction.updateOne(
                        { deposit_id },
                        { $set: { status: 'success', sn: deliverySN, updated_at: new Date() } }
                    );

                    // 📲 Kirim notifikasi WhatsApp
                    try {
                        const conf = await Config.findOne({ key: 'qris_settings' });
                        if (conf && conf.wa_gateway_apikey && conf.wa_gateway_session) {
                            const pesanWA = `*TRANSAKSI KAMU BERHASIL* ✅\n\n` +
                                            `Terima kasih telah berbelanja di *${conf.shop_name}*.\n\n` +
                                            `*Detail Pesanan:*\n` +
                                            `• Order ID: ${currentTr.order_id}\n` +
                                            `• Produk: ${currentTr.item_name}\n` +
                                            `• Tujuan: ${currentTr.target}\n` +
                                            `• Status: SUKSES\n` +
                                            `• SN: ${deliverySN}\n\n` +
                                            `Pesanan Anda diproses otomatis oleh sistem. Jika ada kendala silakan hubungi Kami.`;
                            sendWag(conf.wa_gateway_session, conf.wa_gateway_apikey, currentTr.whatsapp, pesanWA);
                        }
                    } catch (waErr) {
                        console.error("Gagal mengirim notifikasi WA:", waErr.message);
                    }

                    // SN dari trxData.sn hasil /transaksi/status dikirim ke frontend
                    // Frontend akan tampilkan di snDisplay
                    return res.json({ status: true, state: 'success', sn: deliverySN });

                } else if (deliveryState === 'failed') {
                    await Transaction.updateOne(
                        { deposit_id },
                        { $set: { status: 'failed', updated_at: new Date() } }
                    );
                    return res.json({ status: true, state: 'failed', message: 'Pengiriman produk gagal.' });

                } else {
                    // Masih pending — frontend polling ulang, interval tetap jalan
                    await Transaction.updateOne(
                        { deposit_id },
                        { $set: { status: 'pending_delivery', sn: 'Diproses', updated_at: new Date() } }
                    );
                    return res.json({ status: true, state: 'pending_delivery', sn: 'Diproses', message: 'Produk sedang diproses oleh supplier.' });
                }

            } else {
                // Create gagal bukan karena duplicate
                await Transaction.updateOne(
                    { deposit_id },
                    { $set: { status: 'failed', updated_at: new Date() } }
                );
                return res.json({ status: true, state: 'failed', message: buyRes.data.message });
            }

        } else if (status === 'cancel') {
            await Transaction.updateOne(
                { deposit_id },
                { $set: { status: 'cancelled' } }
            );
            return res.json({ status: true, state: 'expired' });

        } else {
            // Status deposit masih pending/waiting dari payment gateway
            return res.json({ status: true, state: status });
        }

    } catch (error) {
        console.error("[CHECK STATUS ERROR]", error.message);
        res.status(500).json({ status: false });
    }
});



/*
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

                // ==========================================
                // 📲 TAMBAHAN: AUTO WHATSAPP NOTIFICATION
                // ==========================================
                try {
                    const conf = await Config.findOne({ key: 'qris_settings' });
                    if (conf && conf.wa_gateway_apikey && conf.wa_gateway_session) {
                        const pesanWA = `*TRANSAKSI KAMU BERHASIL* ✅\n\n` +
                                        `Terima kasih telah berbelanja di *${conf.shop_name}*.\n\n` +
                                        `*Detail Pesanan:*\n` +
                                        `• Order ID: ${currentTr.order_id}\n` +
                                        `• Produk: ${currentTr.item_name}\n` +
                                        `• Tujuan: ${currentTr.target}\n` +
                                        `• Status: SUKSES\n` +
                                        `• SN: ${buyRes.data.data.sn}\n\n` +
                                        `Pesanan Anda diproses otomatis oleh sistem. Jika ada kendala silakan hubungi Kami.`;

                        // Panggil function dari config/wa-gateway.js
                        sendWag(conf.wa_gateway_session, conf.wa_gateway_apikey, currentTr.whatsapp, pesanWA);
                    }
                } catch (waErr) {
                    console.error("Gagal mengirim notifikasi WA:", waErr.message);
                }
                // ==========================================

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


*/
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


// ==========================
// DYNAMIC SITEMAP FOR SEO
// ==========================
app.get('/sitemap.xml', async (req, res) => {
    try {
        // Ambil data semua brand yang aktif dari database
        const brands = await Brand.find({ status: 'active' });
        
        // Ganti URL ini dengan domain asli website Anda nanti
        const baseUrl = 'https://maulanastore.my.id'; 

        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

        // 1. Tambahkan Halaman Statis
        const staticPages = [
            { url: '/', priority: '1.0' },
            { url: '/search', priority: '0.8' },
            { url: '/faq', priority: '0.5' }
        ];

        staticPages.forEach(page => {
            xml += `
  <url>
    <loc>${baseUrl}${page.url}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <priority>${page.priority}</priority>
  </url>`;
        });

        // 2. Tambahkan Halaman Game/Brand secara Dinamis
        brands.forEach(brand => {
            xml += `
  <url>
    <loc>${baseUrl}/id/${brand.slug}</loc>
    <lastmod>${brand.updated_at ? brand.updated_at.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}</lastmod>
    <priority>0.9</priority>
  </url>`;
        });

        xml += `\n</urlset>`;

        // Set header sebagai XML agar dibaca oleh Google sebagai sitemap
        res.header('Content-Type', 'application/xml');
        res.send(xml);
    } catch (e) {
        res.status(500).send("Error generating sitemap");
    }
});

app.listen(PORT, () => console.log(`🚀 Lana Store Server Berjalan di Port ${PORT}`));
