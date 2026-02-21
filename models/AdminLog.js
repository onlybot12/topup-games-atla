const mongoose = require('mongoose');

// Nama schema diubah agar konsisten dengan AdminLog
const AdminSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true }
});

// Export dengan nama model AdminLog
module.exports = mongoose.model('AdminLog', AdminSchema);
