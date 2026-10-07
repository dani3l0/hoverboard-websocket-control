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
const systemDataDefaults = {
	rssi: -100,
	clients: 0,
	ignition: false,
}
let systemData = systemDataDefaults
let watchdogMsec = 0
let wsMotorLastPacket = 0
let wsSystemLastPacket = 0
let wsMotorLatency = 0
let wsSystemLatency = 0

const controlsHzPresets = [5, 10, 20, 25]
let currentHzPreset = 2
let controlsPaused = false

// Websocket connection
let socket
const initSocket = () => {
	socket = new WebSocket(`ws://${host}/ws`)
	socket.binaryType = "arraybuffer"
	socket.addEventListener("message", e => {
		let now = new Date().getTime()
		wsMotorLatency = now - wsMotorLastPacket
		wsMotorLastPacket = now
		data = new Int16Array(e.data)
		incomingData.cmd1 = data[1]
		incomingData.cmd2 = data[2]
		incomingData.speedR = data[3]
		incomingData.speedL = data[4]
		incomingData.batV = data[5]
		incomingData.temp = data[6]
	})
}
initSocket()

const sendControls = () => {
	if (!systemData.ignition || controlsPaused) return
	let data = new Uint16Array([0xABCD, steer, speed])
	let xorChecksum = data.reduce((accumulator, current) => accumulator ^ current, 0)
	let data2 = new Uint16Array([0xABCD, steer, speed, xorChecksum])
	if (socket.readyState == socket.OPEN) socket.send(data2)
}


// Websocket system connection
let systemws
const initSystemConnection = () => {
	systemws = new WebSocket(`ws://${host}/system`)
	systemws.addEventListener("message", e => {
		watchdogMsec = 0
		let now = new Date().getTime()
		wsSystemLatency = now - wsSystemLastPacket
		wsSystemLastPacket = now
		let arr = e.data.split(",")
		systemData.rssi = Number(arr[0])
		systemData.clients = Number(arr[1])
		systemData.ignition = arr[2] == 1
	})
	systemws.addEventListener("close", e => {
		systemData = systemDataDefaults
	})
}
initSystemConnection()


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
		let uneasedSpeed = -y / radius * 0.7
		let uneasedSteer = x / radius * 0.7
		speed = Math.round(uneasedSpeed * Math.abs(uneasedSpeed) * 1000)
		steer = Math.round(uneasedSteer * Math.abs(uneasedSteer) * 1000)
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


let sendControlsInterval = setInterval(sendControls, 1000 / controlsHzPresets[currentHzPreset])


// Debug window
document.getElementById("bottom-bar").addEventListener("click", () => {
	document.body.classList.add("debug")
})
document.getElementById("darken").addEventListener("click", () => {
	document.body.classList.remove("debug")
})
document.getElementById("ignition-value").addEventListener("click", e => {
	let dom = e.target
	if (dom.classList.contains("pending")) return
	systemws.send("power")
	dom.classList.add("pending")
	setTimeout(() => dom.classList.remove("pending"), 3000)
})
const updateControlsHz = (e) => {e.innerText = `${controlsHzPresets[currentHzPreset]} Hz`}
document.getElementById("controls-hz").addEventListener("click", e => {
	let dom = e.target
	currentHzPreset++
	if (currentHzPreset >= controlsHzPresets.length) currentHzPreset = 0
	clearInterval(sendControlsInterval)
	sendControlsInterval = setInterval(sendControls, 1000 / controlsHzPresets[currentHzPreset])
	updateControlsHz(dom)
})
updateControlsHz(document.getElementById("controls-hz"))
const updatePauseControls = (e) => {e.innerText = controlsPaused ? "Controls paused" : "Pause controls"}
document.getElementById("pause-controls").addEventListener("click", e => {
	controlsPaused = !controlsPaused
	updatePauseControls(e.target)
})
updatePauseControls(document.getElementById("pause-controls"))


// Gauges
const generateLabels = (max, steps) => {
	let arr = []
	for (let i = 0; i <= max; i += (max / steps)) {
		arr.push(i)
	}
	return arr
}
const labels = generateLabels(10, 10)
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
	let spd = Math.round(Math.abs(incomingData.speedL) + Math.abs(incomingData.speedR))
	spd /= 2							// Revs were summed from two wheels
	let diameter = Math.PI * 0.25		// Wheel length, meters
	spd *= 60							// Revs per hour
	spd *= diameter						// Meters per hour
	spd /= 1000							// Kilometers per hour
	gaugeSpeed.set(spd)
	document.getElementById("speed-kph").innerText = Math.floor(spd)
	document.getElementById("speed-subkph").innerText = Math.floor(10 * (spd - Math.floor(spd)))
}, 100)

// Slower loop
setInterval(() => {
	// Ignition state
	document.getElementById("ignition-status").innerText = `🔑 ${systemData.ignition ? "ON" : "OFF"}`

	// Connection status
	let connected = systemws.readyState == systemws.OPEN
	let string = "Disconnected"
	if (connected) string = "Connected"
	else if (watchdogMsec < 0) string = "Retrying..."
	else string = "Connecting..."
	document.getElementById("connection-status").innerText = `📡 ${string}`

	// RSSI bar
	let rs = systemData.rssi
	let prssi = document.getElementById("progress-rssi")
	prssi.setAttribute("style", `--value: ${progress(-95, -40, rs)}%`)
	classWarn(prssi, "warn", -79, 1, rs)
	classWarn(prssi, "crit", -88, 1, rs)
	document.getElementById("stat-rssi").innerText = (rs == 0) ? "AP Mode" : `${rs} dBM`

	// Temperature bar
	let temperatur = incomingData.temp / 10
	let ptemp = document.getElementById("progress-temp")
	ptemp.setAttribute("style", `--value: ${progress(35, 60, temperatur)}%`)
	classWarn(ptemp, "warn", -1000, 54, temperatur)
	classWarn(ptemp, "crit", -1000, 58, temperatur)
	document.getElementById("stat-temp").innerText = `${temperatur} °C`

	// Battery bar
	let batt = incomingData.batV / 100
	let pbattery = document.getElementById("progress-battery")
	pbattery.setAttribute("style", `--value: ${progress(34, 41.5, batt)}%`)
	classWarn(pbattery, "warn", 37.2, 45, batt)
	classWarn(pbattery, "crit", 35.1, 48, batt)
	document.getElementById("stat-battery").innerText = `${(batt).toFixed(1)} V`

	// Debug menu
	let now = new Date().getTime()
	// Websocket motor
	let dataFlowMotor = (now - wsMotorLastPacket) < 1500
	let strMotor = "Error"
	if (dataFlowMotor) strMotor = `${wsMotorLatency}ms`
	else if (socket.readyState == socket.OPEN) strMotor = "No data"
	document.getElementById("motor-connection").innerText = strMotor
	// Websocket system
	let dataFlowSystem = (now - wsSystemLastPacket) < 3000
	let strSystem = "Error"
	if (dataFlowSystem) strSystem = `${wsSystemLatency}ms`
	document.getElementById("system-connection").innerText = strSystem
	// Total connections to device
	document.getElementById("serial-connections").innerText = systemData.clients == 1 ? "1" : `${systemData.clients} [!]`
	// Ignition
	let ignValue = document.getElementById("ignition-value")
	ignValue.innerText = systemData.ignition ? "ON" : "OFF"
	systemData.ignition ? ignValue.classList.add("on") : ignValue.classList.remove("on")
}, 250)


// Websocket connection watchdog
setInterval(() => {
	if (watchdogMsec > 5000) {
		socket.close()
		systemws.close()
		initSocket()
		initSystemConnection()
		watchdogMsec = -2500
	}
	watchdogMsec += 100
}, 100)
