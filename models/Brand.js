const mongoose = require('mongoose');

const BrandSchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, unique: true, required: true },
    category: { type: String, required: true },
    icon_url: { type: String, required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    is_popular: { type: Boolean, default: false },
    index: { type: Number, default: 0 },
    // Konfigurasi Form Input User
    form_config: {
        target_label: { type: String, default: 'User ID' },
        target_type: { type: String, default: 'text' },
        has_server: { type: Boolean, default: false },
        server_label: { type: String, default: 'Server ID' },
        server_type: { type: String, default: 'text' }
    },
    // Konfigurasi Cek Nickname
    validation_config: {
        active: { type: Boolean, default: false },
        code: { type: String, default: '' },
        fields: [{
            name: String,
            label: String,
            placeholder: String,
            type: String
        }]
    },
    services: [{ type: String }] 
});

module.exports = mongoose.model('Brand', BrandSchema);
