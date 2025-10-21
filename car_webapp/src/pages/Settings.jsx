import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { CheckCircle, Loader2, Wifi, KeyRound, ShieldCheck, Zap, WifiOff } from 'lucide-react';

// Mock vehicle data for local use
const mockCars = [
	{
		id: 1,
		name: 'AutoDrive One',
		model: 'Sedan X',
		image_url:
			'https://plus.unsplash.com/premium_photo-1683134240084-ba074973f75e?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=1895',
		status: 'offline',
	},
	{
		id: 2,
		name: 'AutoDrive Two',
		model: 'SUV Pro',
		image_url:
			'https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=800&q=80',
		status: 'offline',
	},
];

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
	const [cars, setCars] = useState(mockCars);
	const [isLoading, setIsLoading] = useState(false);

	const handleConnect = (carToConnect) => {
		// Disconnect any other connected cars
		setCars((prev) =>
			prev.map((car) =>
				car.id === carToConnect.id
					? { ...car, status: 'connected' }
					: { ...car, status: 'offline' }
			)
		);
		setSelectedCar(carToConnect);
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
						{cars.map((car) => (
							<motion.div
								key={car.id}
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
												className={`flex items-center gap-2 text-sm px-3 py-1 rounded-full ${
													car.status === 'connected'
														? 'bg-green-500/20 text-green-400'
														: 'bg-slate-600/50 text-slate-300'
												}`}
											>
												{car.status === 'connected' ? (
													<Wifi className="w-4 h-4" />
												) : (
													<WifiOff className="w-4 h-4" />
												)}
												<span>
													{car.status === 'connected'
														? 'Connected'
														: 'Offline'}
												</span>
											</div>
										</div>
									</CardContent>
									<div className="p-6 pt-0">
										<Button
											className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold"
											onClick={() => handleConnect(car)}
											disabled={car.status === 'connected'}
										>
											<Zap className="w-4 h-4 mr-2" />
											{car.status === 'connected'
												? 'Already Connected'
												: 'Connect'}
										</Button>
									</div>
								</Card>
							</motion.div>
						))}
					</motion.div>
				)}
			</div>
		</div>
	);
}