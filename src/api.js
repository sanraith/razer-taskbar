const express = require('express')
const app = express()

let currentBatteryData = {} // Variable to store the latest battery data

app.get('/', (req, res) => {
    res.send('Hello, world!' + new Date().toISOString())
})

app.get('/health', (req, res) => {
    res.send('OK')
})

// Endpoint to get the current battery data
app.get('/battery', (req, res) => {
    res.json(currentBatteryData)
})

app.listen(3001, () => {
    console.log('Server is running on port 3001')
})

// Update the battery data when a message is received
process.on('message', (data) => {
    console.log('Received data in api.js:', data)
    currentBatteryData = data // Update the stored battery data
})
