const mongoose = require('mongoose');

const BrandSchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, unique: true, required: true },
    category: { type: String, required: true },
    icon_url: { type: String, required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    is_popular: { type: Boolean, default: false },
    index: { type: Number, default: 0 },
    // --- TAMBAHAN CONFIG VALIDASI ---
    validation_config: {
        active: { type: Boolean, default: false },
        code: { type: String, default: '' }, // Kode game untuk API isan
        fields: [{
            name: String,        // id, server
            label: String,       // User ID, Zone ID
            placeholder: String, // 12345678
            type: String         // text, number
        }]
    },
    services: [{ type: String }] 
});

module.exports = mongoose.model('Brand', BrandSchema);
