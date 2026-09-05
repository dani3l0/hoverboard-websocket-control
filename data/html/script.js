let speed = 0
let steer = 0
let incomingData = {
	cmd1: 0,
	cmd2: 0,
	speedR: 0,
	speedL: 0,
	batV: 0,
	temp: 0,
}
const host = window.location.host
let rssiData = {
	rssi: -100,
	clients: 0,
}
let watchdogMsec = 0

// Websocket connection
let socket
const initSocket = () => {
	socket = new WebSocket(`ws://${host}/ws`)
	socket.binaryType = "arraybuffer"
	socket.addEventListener("message", e => {
		data = new Int16Array(e.data)
		incomingData.cmd1 = data[1]
		incomingData.cmd2 = data[2]
		incomingData.speedR = data[3]
		incomingData.speedL = data[4]
		incomingData.batV = data[5]
		incomingData.temp = data[6]
		watchdogMsec = 0
	})
}
initSocket()

const sendControls = () => {
	let data = new Uint16Array([0xABCD, steer, speed])
	let xorChecksum = data.reduce((accumulator, current) => accumulator ^ current, 0)
	let data2 = new Uint16Array([0xABCD, steer, speed, xorChecksum])
	if (socket.readyState == socket.OPEN) socket.send(data2)
}


// Websocket RSSI connection
let rssi
const initRssi = () => {
rssi = new WebSocket(`ws://${host}/rssi`)
	rssi.addEventListener("message", e => {
		let arr = e.data.split(",")
		rssiData.rssi = Number(arr[0])
		rssiData.clients = Number(arr[1])
	})
	rssi.addEventListener("close", e => {
		rssiData.rssi = -100
		rssiData.clients = 0
	})
}
initRssi()


// Joystick controls
const initJoystick = () => {
	const base = document.getElementById('joystick-base')
	const handle = document.getElementById('joystick-handle')
	let active = false

	const move = (e) => {
		if (!active) return
		const rect = base.getBoundingClientRect()
		const radius = rect.width / 2
		const clientX = e.touches ? e.touches[0].clientX : e.clientX
		const clientY = e.touches ? e.touches[0].clientY : e.clientY
		let x = clientX - rect.left - radius
		let y = clientY - rect.top - radius
		const distance = Math.sqrt(x*x + y*y)
		if (distance > radius) {
			x = (x / distance) * radius
			y = (y / distance) * radius
		}
		handle.style.left = `calc(50% + ${(x / radius) * 50}%)`
		handle.style.top = `calc(50% + ${(y / radius) * 50}%)`
		speed = Math.round((-y / radius) * 1000)
		steer = Math.round((x / radius) * 1000)
	}

	const end = () => {
		active = false
		handle.style.left = '50%'
		handle.style.top = '50%'
		speed = 0
		steer = 0
	}

	// Mouse
	base.addEventListener('mousedown', (e) => { active = true; move(e); })
	window.addEventListener('mousemove', move)
	window.addEventListener('mouseup', end)

	// Touch
	base.addEventListener('touchstart', (e) => { active = true; move(e); })
	window.addEventListener('touchmove', move)
	window.addEventListener('touchend', end)
}

initJoystick()


// Gauges
const labels = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900]
let gaugeSpeed = new Gauge(document.getElementById("gauge-speed")).setOptions({
	angle: -0.2, // The span of the gauge arc
	lineWidth: 0.02, // The line thickness
	radiusScale: 1, // Relative radius
	pointer: {
	  length: 0.5, // // Relative to gauge radius
	  strokeWidth: 0.025, // The thickness
	  color: '#F64' // Fill color
	},
	limitMax: true,     // If false, max value increases automatically if value > maxValue
	limitMin: true,     // If true, the min value of the gauge will be fixed
	colorStart: '#EEE',   // Colors
	colorStop: '#EEE',    // just experiment with them
	strokeColor: '#444',  // to see which ones work best for you
	generateGradient: true,
	highDpiSupport: true,     // High resolution support
	staticLabels: {
		font: "14px sans-serif",  // Specifies font
		labels: labels,  // Print labels at these values
		color: "#888",  // Optional: Label text color
		fractionDigits: 0  // Optional: Numerical precision. 0=round off.
	},
})
gaugeSpeed.maxValue = labels[labels.length - 1]
gaugeSpeed.minValue = 0
gaugeSpeed.animationSpeed = 32



const progress = (min, max, value) => {
	let pp = ((value - min) / (max - min)) * 100
	return Math.max(0, Math.min(pp, 100))
}
const classWarn = (dom, className, lowThreshold, highThreshold, value) => {
	if (lowThreshold >= value || value >= highThreshold) dom.classList.add(className)
	else dom.classList.remove(className)
}


// Loop
setInterval(() => {
	let spd = (incomingData.speedL + incomingData.speedR) / 2
	gaugeSpeed.set(spd)
	document.getElementById("rpm").innerText = Math.round(spd)
	sendControls()
}, 25)

// Slower loop
setInterval(() => {
	let connected = socket.readyState == socket.OPEN
	let string = "Disconnected"
	if (connected) string = "Connected"
	else if (watchdogMsec < 0) string = "Retrying..."
	else string = "Connecting..."
	document.getElementById("connection-status").innerText = `[${rssiData.clients}] ${string}`

	let rs = rssiData.rssi
	let prssi = document.getElementById("progress-rssi")
	prssi.setAttribute("style", `--value: ${progress(-95, -50, rs)}%`)
	classWarn(prssi, "warn", -83, 1, rs)
	classWarn(prssi, "crit", -90, 1, rs)
	document.getElementById("stat-rssi").innerText = `${rs} dBM`

	let temperatur = incomingData.temp / 10
	let ptemp = document.getElementById("progress-temp")
	ptemp.setAttribute("style", `--value: ${progress(30, 60, temperatur)}%`)
	classWarn(ptemp, "warn", -1000, 52.5, temperatur)
	classWarn(ptemp, "crit", -1000, 56, temperatur)
	document.getElementById("stat-temp").innerText = `${temperatur} °C`

	let batt = incomingData.batV / 100
	let pbattery = document.getElementById("progress-battery")
	pbattery.setAttribute("style", `--value: ${progress(34, 41, batt)}%`)
	classWarn(pbattery, "warn", 37, 45, batt)
	classWarn(pbattery, "crit", 35, 50, batt)
	document.getElementById("stat-battery").innerText = `${(batt).toFixed(1)} V`
}, 250)


// Websocket connection watchdog
setInterval(() => {
	if (watchdogMsec > 5000) {
		socket.close()
		rssi.close()
		initSocket()
		initRssi()
		watchdogMsec = -2500
	}
	watchdogMsec += 100
}, 100)
