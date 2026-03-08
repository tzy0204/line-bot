const mongoose = require('mongoose');

const userSettingSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true
    },
    preferredModel: {
        type: String,
        default: 'gemini-3.1-flash-lite-preview'
    }
});

module.exports = mongoose.model('UserSetting', userSettingSchema);
