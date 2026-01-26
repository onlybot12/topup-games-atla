const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    deposit_id: { 
        type: String, 
        required: true, 
        unique: true, 
        index: true 
    },
    order_id: { 
        type: String, 
        required: true, 
        unique: true, 
        index: true 
    },
    qr_image: String,
    amount: Number,
    base_price: Number,
    item_name: String,
    target: String,
    email: String,
    whatsapp: String,
    status: { 
        type: String, 
        default: 'pending', 
        enum: ['pending', 'success', 'failed', 'cancelled'] 
    },
    sn: String,
    meta: {
        code: String,
        target: String
    },
    created_at: { 
        type: Date, 
        default: Date.now 
    },
    updated_at: { 
        type: Date, 
        default: Date.now 
    }
});

transactionSchema.index({ created_at: -1 });
transactionSchema.index({ status: 1 });

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;
