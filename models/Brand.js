const mongoose = require('mongoose');

const BrandSchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, unique: true, required: true },
    category: { type: String, required: true },
    icon_url: { type: String, required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    is_popular: { type: Boolean, default: false },
    
    // FIELD BARU: Untuk menyimpan urutan drag & drop
    index: { type: Number, default: 0 }, 

    form_config: {
        target_label: { type: String, default: 'User ID' },
        target_type: { type: String, default: 'text' },
        has_server: { type: Boolean, default: false },
        server_label: { type: String, default: 'Server ID' },
        server_type: { type: String, default: 'text' }
    },
    services: [{ type: String }] 
});

// Menambahkan index agar pencarian berdasarkan slug dan urutan index lebih cepat
BrandSchema.index({ slug: 1 });
BrandSchema.index({ index: 1 });

module.exports = mongoose.model('Brand', BrandSchema);
