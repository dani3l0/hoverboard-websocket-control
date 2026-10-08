//////////////////////// Variables ////////////////////////

// Auto-detect if development or on-device use
const host = !["127.0.0.1", "localhost"].includes(window.location.hostname) ?
	window.location.host : "192.168.4.1"

// Data sent to target device
let speed = 0
let steer = 0

// Incoming motor data
const incomingDataDefaults = {
	cmd1: 0,
	cmd2: 0,
	speedR: 0,
	speedL: 0,
	batV: 0,
	temp: -2732,
}

// Incoming system data
const systemDataDefaults = {
	rssi: -111,
	clients: 0,
	ignition: false,
}

// Websocket watchdog & stats
let watchdogMsec = 0
let wsMotorLastPacket = 0
let wsSystemLastPacket = 0
let wsMotorLatency = 0
let wsSystemLatency = 0

// Controls variables
const controlsHzPresets = [5, 10, 20, 25]
let currentHzPreset = 2
let controlsPaused = false

// Sport mode
let sportModeEnabled = false

// Gamepad variables
let gamepadDataDefault = {
	connected: false,
	active: false,
	gas: 0,
	brake: 0,
	steer: 0,
	a: false,
	b: false,
	y: false,
	x: false,
	lastA: false,
	lastB: false,
	lastY: false,
	lastX: false,
}



////////////////////////// Magic //////////////////////////

const copyObj = (obj) => {
	return JSON.parse(JSON.stringify(obj))
}
let systemData = copyObj(systemDataDefaults)
let incomingData = copyObj(incomingDataDefaults)
let gamepadData = copyObj(gamepadDataDefault)

// Motor websocket connection
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
const powerPow = (x) => {
	return Math.sign(x) * Math.pow(Math.abs(x), 1.25)
}
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
		let uneasedSpeed = -y / radius
		let uneasedSteer = x / radius
		const muzzle = 1 - 0.3 * Number(!sportModeEnabled)
		uneasedSpeed *= muzzle
		uneasedSteer *= muzzle
		speed = Math.round(powerPow(uneasedSpeed) * 1000)
		steer = Math.round(powerPow(uneasedSteer) * 1000)
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

// Sending joystick position data
const sendControls = () => {
	updateGamepad()
	if (!systemData.ignition || controlsPaused) return
	let data = new Uint16Array([0xABCD, steer, speed])
	let xorChecksum = data.reduce((accumulator, current) => accumulator ^ current, 0)
	let data2 = new Uint16Array([0xABCD, steer, speed, xorChecksum])
	if (socket.readyState == socket.OPEN) socket.send(data2)
}
let sendControlsInterval = setInterval(sendControls, 1000 / controlsHzPresets[currentHzPreset])


// Debug window
document.getElementById("bottom-bar").addEventListener("click", () => {
	document.body.classList.add("debug")
})
document.getElementById("darken").addEventListener("click", () => {
	document.body.classList.remove("debug")
})

// Ignition
document.getElementById("ignition-value").addEventListener("click", e => {
	let dom = e.target
	if (dom.classList.contains("pending")) return
	systemws.send("power")
	dom.classList.add("pending")
	let pad = document.getElementById("pad-btn-a")
	pad.classList.add("pending")
	setTimeout(() => {
		pad.classList.remove("pending")
		dom.classList.remove("pending")
	}, 3000)
})

// Hz controls
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

// Pause controls
const updatePauseControls = () => {
	let e = document.getElementById("pause-controls")
	let joystick = document.getElementById("joystick-handle")
	let padBtn = document.getElementById("pad-btn-b")
	controlsPaused ? e.classList.add("paused") : e.classList.remove("paused")
	controlsPaused ? joystick.classList.add("paused") : joystick.classList.remove("paused")
	controlsPaused ? padBtn.classList.add("paused") : padBtn.classList.remove("paused")

}
document.getElementById("pause-controls").addEventListener("click", e => {
	controlsPaused = !controlsPaused
	updatePauseControls()
})
updatePauseControls()

// SPORT controls
const updateSportControls = () => {
	let e = document.getElementById("sport-mode")
	let joystick = document.getElementById("joystick-handle")
	let padBtn = document.getElementById("pad-btn-x")
	sportModeEnabled ? e.classList.add("enabled") : e.classList.remove("enabled")
	sportModeEnabled ? joystick.classList.add("sport") : joystick.classList.remove("sport")
	sportModeEnabled ? padBtn.classList.add("sport") : padBtn.classList.remove("sport")
}
document.getElementById("sport-mode").addEventListener("click", e => {
	sportModeEnabled = !sportModeEnabled
	updateSportControls()
})
updateSportControls()

// Toggle WiFi mode
document.getElementById("toggle-wifi").addEventListener("click", () => {
	const ap = "AP (WiFi hotspot)"
	const sta = "STA (WiFi client)"
	document.getElementById("toggle-wifi-current").innerText = systemData.rssi == 0 ? ap : sta
	document.getElementById("toggle-wifi-target").innerText = systemData.rssi == 0 ? sta : ap
	document.getElementById("toggle-wifi-prompt").classList.add("visible")
})
document.getElementById("toggle-wifi-cancel").addEventListener("click", () => {
	document.getElementById("toggle-wifi-prompt").classList.remove("visible")
})
document.getElementById("toggle-wifi-confirm").addEventListener("click", () => {
	systemws.send("switchwifi")
	document.getElementById("toggle-wifi-end").classList.add("visible")
})


// Gauges
const generateLabels = (max, steps) => {
	let arr = []
	for (let i = 0; i <= max; i += (max / steps)) {
		arr.push(i)
	}
	return arr
}
const labels = generateLabels(18, 9)
let gaugeSpeed = new Gauge(document.getElementById("gauge-speed")).setOptions({
	angle: -0.2, // The span of the gauge arc
	lineWidth: 0.02, // The line thickness
	radiusScale: 1, // Relative radius
	pointer: {
	  length: 0.5, // // Relative to gauge radius
	  strokeWidth: 0.025, // The thickness
	  color: '#F33' // Fill color
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


// Class selector for summary boxes located below gauge
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
	spd /= 2							// Divide total revs by number of wheels
	let diameter = Math.PI * 0.25		// Wheel length, meters (0.25m)
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
	let rssiText = `${rs} dBM`
	if (rs == 0) rssiText = "AP Mode"
	else if (rs == systemDataDefaults.rssi) rssiText = "N/A"
	document.getElementById("stat-rssi").innerText = rssiText

	// Temperature bar
	let temperatur = incomingData.temp / 10
	let ptemp = document.getElementById("progress-temp")
	ptemp.setAttribute("style", `--value: ${progress(35, 60, temperatur)}%`)
	classWarn(ptemp, "warn", -100, 54, temperatur)
	classWarn(ptemp, "crit", -200, 58, temperatur)
	document.getElementById("stat-temp").innerText = (incomingData.temp == incomingDataDefaults.temp) ? "N/A" : `${temperatur} °C`

	// Battery bar
	let batt = incomingData.batV / 100
	let pbattery = document.getElementById("progress-battery")
	pbattery.setAttribute("style", `--value: ${progress(34, 41.5, batt)}%`)
	classWarn(pbattery, "warn", 37.2, 45, batt)
	classWarn(pbattery, "crit", 35.1, 48, batt)
	document.getElementById("stat-battery").innerText = (incomingData.batV == incomingDataDefaults.batV) ? "N/A" : `${(batt).toFixed(1)} V`

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
	let padIgn = document.getElementById("pad-btn-a")
	ignValue.innerText = systemData.ignition ? "ON" : "OFF"
	systemData.ignition ? ignValue.classList.add("on") : ignValue.classList.remove("on")
	systemData.ignition ? padIgn.classList.add("on") : padIgn.classList.remove("on")

	// Gamepad
	updateInputModes()
}, 250)


// Websocket connection watchdog
setInterval(() => {
	if (watchdogMsec > 5000) {
		socket.close()
		systemws.close()
		systemData = copyObj(systemDataDefaults)
		incomingData = copyObj(incomingDataDefaults)
		initSocket()
		initSystemConnection()
		watchdogMsec = -2500
	}
	watchdogMsec += 100
}, 100)


// Gamepad shit
const updateGamepad = () => {
	if (!gamepadData.connected) return
	let pads = navigator.getGamepads()
	if (pads.length == 0) return
	let pad = pads[0]

	let axes = pad.axes
	let legacy = axes.length == 4
	gamepadData.steer = axes[0]
	if (!legacy) {
		gamepadData.gas = (1 + axes[4]) / 2
		gamepadData.brake = (1 + axes[5]) / 2
	} else {
		let rj = -axes[3]
		let gas = 0
		let brake = 0
		if (rj > 0) gas = Math.abs(rj)
		else brake = Math.abs(rj)
		gamepadData.gas = gas
		gamepadData.brake = brake
	}
	if (gamepadData.active) {
		steer = Math.round(gamepadData.steer * 1000)
		speed = Math.round((gamepadData.gas - gamepadData.brake) * 1000)
	}
	let barGas = document.getElementById("pad-bar-gas")
	let barBrake = document.getElementById("pad-bar-brake")
	barGas.style.setProperty("--value", gamepadData.gas)
	barBrake.style.setProperty("--value", gamepadData.brake)
	let barSteer = document.getElementById("pad-bar-steer")
	let sl = 0
	let sr = 0
	if (gamepadData.steer > 0) sr = gamepadData.steer
	else sl = Math.abs(gamepadData.steer)
	barSteer.style.setProperty("--left", sl)
	barSteer.style.setProperty("--right", sr)

	let abyx = [
		pad.buttons[0].value,
		pad.buttons[1].value,
		pad.buttons[4].value,
		pad.buttons[3].value,
	]
	if (legacy) {
		abyx = [
			pad.buttons[0].value,
			pad.buttons[1].value,
			pad.buttons[3].value,
			pad.buttons[2].value,
		]
	}
	console.log(abyx)
	gamepadData.a = Boolean(abyx[0])
	gamepadData.b = Boolean(abyx[1])
	gamepadData.x = Boolean(abyx[3])
	gamepadData.y = Boolean(abyx[2])
	let domA = document.getElementById("pad-btn-a")
	let domB = document.getElementById("pad-btn-b")
	let domY = document.getElementById("pad-btn-y")
	let domX = document.getElementById("pad-btn-x")
	gamepadData.a ? domA.classList.add("pressed") : domA.classList.remove("pressed")
	gamepadData.b ? domB.classList.add("pressed") : domB.classList.remove("pressed")
	gamepadData.y ? domY.classList.add("pressed") : domY.classList.remove("pressed")
	gamepadData.x ? domX.classList.add("pressed") : domX.classList.remove("pressed")

	if (gamepadData.active) {
		if (padClick(gamepadData.a, gamepadData.lastA)) {
			document.getElementById("ignition-value").click()
		}
		if (padClick(gamepadData.b, gamepadData.lastB)) {
			document.getElementById("pause-controls").click()
		}
		if (padClick(gamepadData.x, gamepadData.lastX)) {
			document.getElementById("sport-mode").click()
		}
	}
	if (padClick(gamepadData.y, gamepadData.lastY)) {
		gamepadData.active = !gamepadData.active
	}

	gamepadData.lastA = gamepadData.a
	gamepadData.lastB = gamepadData.b
	gamepadData.lastY = gamepadData.y
	gamepadData.lastX = gamepadData.x
}

window.addEventListener("gamepadconnected", (e) => {
	gamepadData.connected = true
	gamepadData.active = true
	document.getElementById("pad-name").innerText = "🎮 " + e.gamepad.id.split("(")[0]
})
window.addEventListener("gamepaddisconnected", (e) => {
	document.getElementById("pad-name").innerText = ""
	gamepadData = copyObj(gamepadDataDefault)
	speed = 0
	steer = 0
})

const updateInputModes = () => {
	let jw = document.getElementById("joystick-wrapper")
	gamepadData.active ? jw.classList.add("pad") : jw.classList.remove("pad")
}
const padClick = (curr, last) => {
	return curr && curr != last
}
