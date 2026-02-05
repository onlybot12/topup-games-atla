const mongoose = require('mongoose');

const VoucherSchema = new mongoose.Schema({
    code: { type: String, unique: true, required: true },
    type: { type: String, enum: ['percentage', 'fixed'], default: 'fixed' },
    value: { type: Number, required: true },
    min_order: { type: Number, default: 0 },
    quota: { type: Number, required: true, default: 1 }, // Total jatah redeem
    used_count: { type: Number, default: 0 }, // Sudah berapa kali dipakai
    is_active: { type: Boolean, default: true },
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Voucher', VoucherSchema);
