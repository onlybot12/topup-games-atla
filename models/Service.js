const mongoose = require('mongoose');

const ServiceSchema = new mongoose.Schema({
    service_id: { type: String, unique: true }, // Field "code" dari API
    name: { type: String },
    category: { type: String },
    brand: { type: String },        // Field "provider" dari API
    price_original: { type: Number }, // Field "price" dari API
    price_sell: { type: Number },     // Hasil hitung Modal + Profit %
    status_api: { type: String },     // "available" atau "empty"
    img_url: { type: String },
    note: { type: String },
    is_active: { type: Boolean, default: true },
    updated_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Service', ServiceSchema);
