const mongoose = require('mongoose');

const BrandSchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, unique: true, required: true },
    category: { type: String, required: true }, // Contoh: Games, Pulsa, dll
    icon_url: { type: String, required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    // Konfigurasi Form sesuai Foto
    form_config: {
        target_label: { type: String, default: 'User ID' },
        target_type: { type: String, default: 'text' }, // text, number, email
        has_server: { type: Boolean, default: false },
        server_label: { type: String, default: 'Server ID' },
        server_type: { type: String, default: 'text' },
        is_dropdown: { type: Boolean, default: false }
    },
    // Menghubungkan ke ID Layanan dari database Service
    services: [{ type: String }] 
});

module.exports = mongoose.model('Brand', BrandSchema);
