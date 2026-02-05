const mongoose = require('mongoose');

const ServiceSchema = new mongoose.Schema({
    service_id: { type: String, unique: true }, 
    name: { type: String },
    category: { type: String },
    brand: { type: String },        
    price_original: { type: Number }, 
    price_sell: { type: Number },     
    status_api: { type: String },     
    img_url: { type: String },
    is_active: { type: Boolean, default: true },
    updated_at: { type: Date, default: Date.now }
});

// Index agar pencarian di jutaan data tetap cepat
ServiceSchema.index({ name: 'text', service_id: 'text', brand: 'text', category: 'text' });

module.exports = mongoose.model('Service', ServiceSchema);
