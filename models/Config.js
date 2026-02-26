const mongoose = require('mongoose');

const ConfigSchema = new mongoose.Schema({
    key: { type: String, unique: true, required: true },
    admin_fee: { type: Number, default: 700 }, 
    tax_percent: { type: Number, default: 1.6 }, 
    vendor_fee_fixed: { type: Number, default: 200 }, 
    wa_gateway_session: { type: String, default: "" },
    wa_gateway_apikey: { type: String, default: "" },
    wa_cs: { type: String, default: "" }, 
    shop_name: { type: String, default: "Lana Store" },
    meta_description: { type: String, default: "Topup Game Tercepat & Termurah di Indonesia" },
    meta_keywords: { type: String, default: "topup game, diamond ml, ff murah, vouchers" },
    logo_url: { type: String, default: "" },
    title_popular: { type: String, default: "POPULER SEKARANG!" },
    title_flash_sale: { type: String, default: "PASTI TER-MURAAHH" }, 
    wa_link: { type: String, default: "" },
    ig_link: { type: String, default: "" },
    tiktok_link: { type: String, default: "" },
    footer_description: { 
        type: String, 
        default: "No #1 supplier top up game & voucher terlaris, murah, aman legal 100% buka 24 Jam dengan payment terlengkap Indonesia" 
    },
    footer_trade_info: { 
        type: String, 
        default: "Direktorat Jenderal Perlindungan Konsumen dan Tertib Niaga Kementerian Perdagangan RI 0853-1111-1010" 
    }
});

module.exports = mongoose.model('Config', ConfigSchema);
