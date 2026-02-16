const mongoose = require('mongoose');

const ConfigSchema = new mongoose.Schema({
    key: { type: String, unique: true },
    admin_fee: { type: Number, default: 700 },
    tax_percent: { type: Number, default: 1.4 },
    // SETTING JUDUL SECTION
    title_popular: { type: String, default: "POPULER SEKARANG!" },
    title_flash_sale: { type: String, default: "Flash Sale" },
    // SETTING SOSMED & FOOTER
    wa_link: { type: String, default: "" },
    ig_link: { type: String, default: "" },
    fb_link: { type: String, default: "" },
    tiktok_link: { type: String, default: "" }
});

module.exports = mongoose.model('Config', ConfigSchema);
