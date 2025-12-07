import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { CheckCircle, Loader2, Wifi, KeyRound, ShieldCheck, Zap, WifiOff } from 'lucide-react';

// Default car image for devices
const defaultCarImage = 'https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=800&q=80';

const connectionSteps = [
	{ text: 'Establishing secure link...', icon: Wifi },
	{ text: 'Verifying vehicle credentials...', icon: KeyRound },
	{ text: 'Syncing control systems...', icon: ShieldCheck },
	{ text: 'Connection successful!', icon: CheckCircle },
];

function ConnectionAnimator({ car, onComplete }) {
	const [status, setStatus] = useState(0);

	React.useEffect(() => {
		if (status < connectionSteps.length - 1) {
			const timer = setTimeout(() => setStatus((s) => s + 1), 1000);
			return () => clearTimeout(timer);
		} else {
			const finalTimer = setTimeout(onComplete, 1000);
			return () => clearTimeout(finalTimer);
		}
	}, [status, onComplete]);

	return (
		<div className="flex flex-col items-center justify-center text-white p-4 text-center">
			<AnimatePresence mode="wait">
				<motion.div
					key={status}
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -20 }}
					transition={{ duration: 0.5 }}
					className="flex flex-col items-center space-y-4"
				>
					{status < connectionSteps.length - 1 ? (
						<Loader2 className="w-12 h-12 text-blue-400 animate-spin" />
					) : (
						<CheckCircle className="w-12 h-12 text-green-400" />
					)}

					<h1 className="text-2xl md:text-3xl font-medium">
						{connectionSteps[status].text}
					</h1>
					<p className="text-slate-400">
						Connecting to {car.name} ({car.model})...
					</p>

					<div className="w-64 bg-slate-700 rounded-full h-2.5">
						<motion.div
							className="bg-gradient-to-r from-blue-500 to-cyan-400 h-2.5 rounded-full"
							initial={{ width: '0%' }}
							animate={{
								width: `${((status + 1) / connectionSteps.length) * 100}%`,
							}}
							transition={{ duration: 1, ease: 'linear' }}
						/>
					</div>
				</motion.div>
			</AnimatePresence>
		</div>
	);
}

export default function SettingsPage() {
	const navigate = useNavigate();
	const [selectedCar, setSelectedCar] = useState(null);
	const [cars, setCars] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const pollingRef = useRef(null);

	const fetchDevices = useCallback(async (withSpinner = false) => {
		if (withSpinner) {
			setIsLoading(true);
		}
		try {
			const response = await fetch('http://localhost:8000/devices');
			const data = await response.json();
			console.log('Fetched devices data:', data);
			const mappedCars = (data.devices || []).map(device => {
				const isAvailable = device.available !== false;
				const deviceState = device.connected
					? 'connected'
					: isAvailable
						? 'available'
						: 'offline';
				return {
					id: device.device_id,
					name: device.device_id || 'Unknown Device',
					model: device.info || 'Pi Simulator',
					image_url: defaultCarImage,
					status: deviceState,
					connected: device.connected,
					available: isAvailable,
				};
			});
			console.log('Mapped cars:', mappedCars);
			setCars(mappedCars);
		} catch (error) {
			console.error('Error fetching devices:', error);
		} finally {
			if (withSpinner) {
				setIsLoading(false);
			}
		}
	}, []);

	const clearPolling = () => {
		if (pollingRef.current) {
			clearInterval(pollingRef.current);
			pollingRef.current = null;
		}
	};

	useEffect(() => {
		fetchDevices(true);
		return () => clearPolling();
	}, [fetchDevices]);

	useEffect(() => {
		const intervalId = setInterval(() => {
			fetchDevices(false);
		}, 3000);
		return () => clearInterval(intervalId);
	}, [fetchDevices]);

	const handleDisconnect = async (carToDisconnect) => {
		console.log('Disconnecting car:', carToDisconnect);
		clearPolling();
		setSelectedCar(null);
		try {
			const response = await fetch('http://localhost:8000/disconnect_device', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ device_id: carToDisconnect.id })
			});
			console.log('Disconnect response:', response.status, response.ok);
			setCars(prev => prev.map(car =>
				car.id === carToDisconnect.id
					? { ...car, status: car.available ? 'available' : 'offline', connected: false }
					: car
			));
			await fetchDevices();
		} catch (error) {
			console.error('Error disconnecting device:', error);
		}
	};

	const handleConnect = async (carToConnect) => {
		if (carToConnect.status === 'connected') {
			await handleDisconnect(carToConnect);
			return;
		}
		if (carToConnect.status === 'connecting') {
			console.log('Connect already in progress for', carToConnect.id);
			return;
		}
		if (!carToConnect.available) {
			console.warn('Device not available for connection:', carToConnect.id);
			return;
		}
		console.log('Connecting to car:', carToConnect);
		clearPolling();
		setSelectedCar(null);
		setCars(prev => prev.map(car =>
			car.id === carToConnect.id
				? { ...car, status: 'connecting' }
				: { ...car, status: car.available ? 'available' : 'offline', connected: false }
		));
		try {
			const response = await fetch('http://localhost:8000/connect_device', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					device_id: carToConnect.id,
					ws_url: 'ws://localhost:8000/ws'
				})
			});
			console.log('Connect response:', response.status, response.ok);
			if (response.ok) {
				pollingRef.current = setInterval(async () => {
					try {
						const res = await fetch('http://localhost:8000/devices');
						const data = await res.json();
						const device = data.devices.find(d => d.device_id === carToConnect.id);
						console.log('Polling device status:', device);
						if (device && device.connected) {
							console.log('Device connected, navigating to Dashboard');
							clearPolling();
							setCars(prev => prev.map(car =>
								car.id === carToConnect.id ? { ...car, status: 'connected', connected: true } : car
							));
							setSelectedCar(carToConnect);
						}
					} catch (error) {
						console.error('Error polling devices:', error);
					}
				}, 1000); // Poll every 1 second
			} else {
				console.error('Failed to connect device');
				await fetchDevices();
			}
		} catch (error) {
			console.error('Error connecting device:', error);
			await fetchDevices();
		}
	};

	const onConnectionComplete = () => {
		navigate('/Dashboard');
	};

	if (selectedCar) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<ConnectionAnimator car={selectedCar} onComplete={onConnectionComplete} />
			</div>
		);
	}

	return (
		<div className="min-h-screen p-4 md:p-8">
			<div className="max-w-4xl mx-auto text-white">
				<motion.div
					initial={{ opacity: 0, y: -20 }}
					animate={{ opacity: 1, y: 0 }}
					className="text-center mb-8"
				>
					<h1 className="text-4xl font-bold mb-2">My Vehicles</h1>
					<p className="text-slate-400">
						Select a vehicle to connect and start driving.
					</p>
				</motion.div>

				{isLoading ? (
					<div className="text-center">
						<Loader2 className="w-8 h-8 mx-auto animate-spin" />
					</div>
				) : (
					<motion.div
						className="grid grid-cols-1 md:grid-cols-2 gap-6"
						variants={{
							hidden: {},
							show: { transition: { staggerChildren: 0.1 } },
						}}
						initial="hidden"
						animate="show"
					>
						{cars.map((car, index) => {
							const isConnected = car.status === 'connected';
							const isConnecting = car.status === 'connecting';
							const isAvailable = car.status === 'available';
							const badgeClass = isConnected
								? 'bg-green-500/20 text-green-400'
								: isConnecting
								? 'bg-yellow-500/20 text-yellow-400'
								: isAvailable
								? 'bg-blue-500/20 text-blue-300'
								: 'bg-slate-600/50 text-slate-300';
							const badgeIcon = isConnected ? (
								<Wifi className="w-4 h-4" />
							) : isConnecting ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : isAvailable ? (
								<Zap className="w-4 h-4" />
							) : (
								<WifiOff className="w-4 h-4" />
							);
							const badgeLabel = isConnected
								? 'Connected'
								: isConnecting
								? 'Connecting...'
								: isAvailable
								? 'Ready'
								: 'Offline';
							const buttonDisabled = isConnecting || (!car.available && !car.connected);
							const buttonIcon = isConnected ? (
								<WifiOff className="w-4 h-4 mr-2" />
							) : isConnecting ? (
								<Loader2 className="w-4 h-4 mr-2 animate-spin" />
							) : isAvailable ? (
								<Zap className="w-4 h-4 mr-2" />
							) : (
								<WifiOff className="w-4 h-4 mr-2" />
							);
							const buttonLabel = isConnected
								? 'Disconnect'
								: isConnecting
								? 'Connecting...'
								: isAvailable
								? 'Connect'
								: 'Unavailable';
							const buttonCursor = isConnecting ? 'wait' : buttonDisabled ? 'not-allowed' : 'pointer';

							return (
								<motion.div
									key={car.id || `device-${index}`}
									variants={{
										hidden: { opacity: 0, y: 20 },
										show: { opacity: 1, y: 0 },
									}}
								>
									<Card className="glass-effect border-slate-700 h-full flex flex-col justify-between">
										<CardContent className="pt-6">
											<img
												src={car.image_url}
												alt={car.name}
												className="rounded-lg mb-4 aspect-video object-cover"
											/>
											<div className="flex justify-between items-start">
												<div>
													<h2 className="text-xl font-bold">{car.name}</h2>
													<p className="text-slate-400">{car.model}</p>
												</div>
												<div
													className={`flex items-center gap-2 text-sm px-3 py-1 rounded-full ${badgeClass}`}
												>
													{badgeIcon}
													<span>{badgeLabel}</span>
												</div>
											</div>
										</CardContent>
										<div className="p-6 pt-0">
											<Button
												className="w-full text-white font-bold"
												style={{
													opacity: buttonDisabled ? 0.5 : 1,
													cursor: buttonCursor,
												}}
												onClick={() => handleConnect(car)}
												disabled={buttonDisabled}
												title={!isAvailable && !isConnected ? 'Device is offline' : undefined}
											>
												{buttonIcon}
												{buttonLabel}
											</Button>
										</div>
									</Card>
								</motion.div>
							);
						})}
					</motion.div>
				)}
			</div>
		</div>
	);
}