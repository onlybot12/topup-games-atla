const mongoose = require('mongoose');

// Definisi Sub-Schema untuk Field Validasi
const FieldSchema = new mongoose.Schema({
    name: { type: String },
    label: { type: String },
    placeholder: { type: String },
    type: { type: String }
}, { _id: false }); // _id: false agar tidak membuat ID di setiap baris input

const BrandSchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, unique: true, required: true },
    category: { type: String, required: true },
    icon_url: { type: String, required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    is_popular: { type: Boolean, default: false },
    index: { type: Number, default: 0 },
    form_config: {
        target_label: { type: String, default: 'User ID' },
        target_type: { type: String, default: 'text' },
        has_server: { type: Boolean, default: false },
        server_label: { type: String, default: 'Server ID' },
        server_type: { type: String, default: 'text' }
    },
    validation_config: {
        active: { type: Boolean, default: false },
        code: { type: String, default: '' },
        fields: [FieldSchema] // MENGGUNAKAN SUB-SCHEMA YANG SUDAH DIDEFINISIKAN
    },
    services: [{ type: String }] 
});

module.exports = mongoose.model('Brand', BrandSchema);
