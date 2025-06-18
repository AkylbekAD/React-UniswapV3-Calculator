import React, { useState } from "react";
import SwapPriceCalculator from "./components/SwapPriceCalculator";
import PriceIncreaseCalculator from "./components/PriceIncreaseCalculator";
import PriceDecreaseCalculator from "./components/PriceDecreaseCalculator";
import "./styles.css";

const App = () => {
	const [activeTab, setActiveTab] = useState("swap");

	const renderContent = () => {
		switch (activeTab) {
			case "swap":
				return <SwapPriceCalculator />;
			case "increase":
				return <PriceIncreaseCalculator />;
			case "decrease":
				return <PriceDecreaseCalculator />;
			default:
				return null;
		}
	};

	return (
		<div className='app'>
			<h1>Uniswap V3 Swap Calculators</h1>

			<div className='tabs'>
				<button
					className={activeTab === "swap" ? "active" : ""}
					onClick={() => setActiveTab("swap")}
				>
					Курс после свапа
				</button>
				<button
					className={activeTab === "increase" ? "active" : ""}
					onClick={() => setActiveTab("increase")}
				>
					Повышение цены
				</button>
				<button
					className={activeTab === "decrease" ? "active" : ""}
					onClick={() => setActiveTab("decrease")}
				>
					Понижение цены
				</button>
			</div>

			<div className='tab-content'>{renderContent()}</div>
		</div>
	);
};

export default App;
