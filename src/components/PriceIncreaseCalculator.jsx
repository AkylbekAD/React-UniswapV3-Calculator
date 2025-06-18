import React, { useState } from "react";
import { ethers } from "ethers";
import Quoter from "@uniswap/v3-periphery/artifacts/contracts/lens/QuoterV2.sol/QuoterV2.json";
import Pool from "@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json";
import Factory from "@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json";
import ERC20ABI from "../erc20.json";
import { NETWORKS } from "../config/net_configs";

const QuoterV2ABI = Quoter.abi;
const PoolABI = Pool.abi;
const FactoryABI = Factory.abi;

const PriceIncreaseCalculator = () => {
	const [token0, setToken0] = useState(
		"0x2d8ecB8Dd7a70E49f70F5224AF7573078Ec20052"
	);
	const [token1, setToken1] = useState(
		"0x55d398326f99059fF775485246999027B3197955"
	);
	const [fee, setFee] = useState("100");
	const [network, setNetwork] = useState("bsc_mainnet");
	const [targetPrice, setTargetPrice] = useState("");
	const [result, setResult] = useState("");
	const [loading, setLoading] = useState(false);

	const formatFullDecimal = (num, decimals = 18) => {
		return Number(num).toLocaleString("en-US", {
			minimumFractionDigits: decimals,
			useGrouping: false,
		});
	};

	const calculatePriceIncrease = async () => {
		setLoading(true);
		setResult("Загрузка...\n");

		try {
			const net = NETWORKS[network];
			const url = net.URL;
			const provider = new ethers.providers.JsonRpcProvider(url);

			const factory = new ethers.Contract(
				net.FACTORY_ADDRESS,
				FactoryABI,
				provider
			);
			const poolAddress = await factory.getPool(token0, token1, parseInt(fee));
			if (!poolAddress || poolAddress === ethers.constants.AddressZero) {
				setResult("Пул не найден");
				return;
			}

			const poolContract = new ethers.Contract(poolAddress, PoolABI, provider);
			const slot0 = await poolContract.slot0();
			const token0Address = await poolContract.token0();
			const token0IsTokenA = token0.toLowerCase() === token0Address.toLowerCase();

			const token0Contract = new ethers.Contract(token0, ERC20ABI, provider);
			const token1Contract = new ethers.Contract(token1, ERC20ABI, provider);

			const decimals0 = await token0Contract.decimals();
			const decimals1 = await token1Contract.decimals();
			const token0Name = await token0Contract.name();
			const token1Name = await token1Contract.name();

			const quoter = new ethers.Contract(
				net.QUOTER2_ADDRESS,
				QuoterV2ABI,
				provider
			);

			const sqrtToPrice = (sqrtX96, decimals0, decimals1, token0IsInput) => {
				const numerator = sqrtX96 * sqrtX96;
				const denominator = 2n ** 192n;
				let ratio = Number(numerator) / Number(denominator);
				const decimalShift = 10 ** (decimals0 - decimals1);
				ratio *= decimalShift;
				return token0IsInput ? ratio : 1 / ratio;
			};

			// Get accurate price using quoter with small test amounts
			const getAccuratePrice = async (
				quoter,
				tokenIn,
				tokenOut,
				feeAmount,
				decimalsIn,
				decimalsOut,
				slippagePercent = 0.5
			) => {
				try {
					// Use 1 token as test amount
					const testAmount = ethers.utils.parseUnits("1", decimalsIn);

					const params = {
						tokenIn: tokenIn,
						tokenOut: tokenOut,
						fee: parseInt(feeAmount),
						amountIn: testAmount,
						sqrtPriceLimitX96: 0,
					};

					const quote = await quoter.callStatic.quoteExactInputSingle(params);
					const outputAmount = ethers.utils.formatUnits(
						quote.amountOut,
						decimalsOut
					);
					const rawPrice = parseFloat(outputAmount);

					// Apply slippage consideration like Uniswap interface
					const priceWithSlippage = rawPrice * (1 - slippagePercent / 100);

					return {
						rawPrice,
						priceWithSlippage,
						sqrtPriceAfter: quote.sqrtPriceX96After,
					};
				} catch (error) {
					console.error("Error getting accurate price:", error);
					return null;
				}
			};

			// Get bidirectional pricing for better accuracy
			const getBidirectionalPrice = async (
				quoter,
				token0Addr,
				token1Addr,
				feeAmount,
				decimals0,
				decimals1
			) => {
				try {
					// Get price in both directions
					const price0to1 = await getAccuratePrice(
						quoter,
						token0Addr,
						token1Addr,
						feeAmount,
						decimals0,
						decimals1
					);
					const price1to0 = await getAccuratePrice(
						quoter,
						token1Addr,
						token0Addr,
						feeAmount,
						decimals1,
						decimals0
					);

					if (!price0to1 || !price1to0) {
						return null;
					}

					// Calculate inverse of the reverse price
					const price1to0Inverse = 1 / price1to0.rawPrice;

					// Average the prices for better accuracy
					const averageRawPrice = (price0to1.rawPrice + price1to0Inverse) / 2;
					const averagePriceWithSlippage =
						(price0to1.priceWithSlippage + price1to0Inverse * 0.995) / 2;

					return {
						price0to1: price0to1.rawPrice,
						price1to0Inverse: price1to0Inverse,
						averageRawPrice,
						averagePriceWithSlippage,
						priceWithSlippage: averagePriceWithSlippage,
					};
				} catch (error) {
					console.error("Error getting bidirectional price:", error);
					return null;
				}
			};

			// Get accurate pricing using quoter
			const bidirectionalPricing = await getBidirectionalPrice(
				quoter,
				token0,
				token1,
				fee,
				decimals0,
				decimals1
			);

			// Use the most accurate price (quoter-based with slippage consideration)
			let currentPrice;
			if (bidirectionalPricing) {
				currentPrice =
					token0 === token0Address
						? bidirectionalPricing.priceWithSlippage
						: 1 / bidirectionalPricing.priceWithSlippage;
			} else {
				setResult("Ошибка при получении цены пула");
				return;
			}

			const desiredPrice = parseFloat(targetPrice);

			if (isNaN(desiredPrice) || desiredPrice <= currentPrice) {
				setResult("Целевая цена должна быть больше текущей");
				return;
			}

			let output = `📊 Текущая цена: 1 ${token0Name} = ${formatFullDecimal(
				currentPrice,
				18
			)} ${token1Name}\n`;
			output += `🎯 Целевая цена: 1 ${token0Name} = ${desiredPrice} ${token1Name}\n`;

			const simulate = async (amount) => {
				const parsedAmount = ethers.utils.parseUnits(amount.toString(), decimals1);
				const params = {
					tokenIn: token1,
					tokenOut: token0,
					fee: parseInt(fee),
					amountIn: parsedAmount,
					sqrtPriceLimitX96: 0,
				};
				try {
					const quote = await quoter.callStatic.quoteExactInputSingle(params);
					const newPrice = sqrtToPrice(
						BigInt(quote.sqrtPriceX96After.toString()),
						token0IsTokenA ? decimals0 : decimals1,
						token0IsTokenA ? decimals1 : decimals0,
						token0IsTokenA
					);
					return token0 === token0Address ? newPrice : 1 / newPrice;
				} catch {
					return null;
				}
			};

			let min = 1_000;
			let max = 10_000_000;
			let bestAmount = 0;
			let iterations = 0;
			while (min < max && iterations < 30) {
				const testAmount = (min + max) / 2;
				const simulatedPrice = await simulate(testAmount);
				if (!simulatedPrice) {
					output += `🔍 Swap try №${iterations + 1}: ${testAmount.toFixed(
						0
					)} ${token1Name} → ошибка (симуляция не удалась)\n`;
					max = testAmount;
					iterations++;
					continue;
				}
				const errorPercent =
					(Math.abs(simulatedPrice - desiredPrice) / desiredPrice) * 100;
				output += `🔍 Swap try №${iterations + 1}: ${testAmount.toFixed(
					0
				)} ${token1Name} → цена ${simulatedPrice.toFixed(
					6
				)} (δ = ${errorPercent.toFixed(2)}%)\n`;
				if (errorPercent < 0.1) {
					bestAmount = testAmount;
					break;
				}
				if (simulatedPrice < desiredPrice) {
					bestAmount = testAmount;
					min = testAmount + 1;
				} else {
					max = testAmount - 1;
				}
				iterations++;
			}

			output += `\n💰 Требуется свапнуть ~ ${Math.ceil(
				bestAmount
			).toLocaleString()} ${token1Name}`;
			setResult(output);
		} catch (e) {
			console.error(e);
			setResult("Ошибка при расчёте:", e);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className='calculator'>
			<h2>Расчёт повышения цены (Price ↑)</h2>
			<input
				type='text'
				placeholder='Token0 Address'
				value={token0}
				onChange={(e) => setToken0(e.target.value)}
			/>
			<input
				type='text'
				placeholder='Token1 Address'
				value={token1}
				onChange={(e) => setToken1(e.target.value)}
			/>
			<input
				type='number'
				placeholder='Target Price'
				value={targetPrice}
				onChange={(e) => setTargetPrice(e.target.value)}
			/>
			<input
				type='number'
				placeholder='Fee (100/500/3000)'
				value={fee}
				onChange={(e) => setFee(e.target.value)}
			/>
			<select value={network} onChange={(e) => setNetwork(e.target.value)}>
				{Object.entries(NETWORKS).map(([key, net]) => (
					<option key={key} value={key}>
						{net.name}
					</option>
				))}
			</select>
			<button onClick={calculatePriceIncrease} disabled={loading}>
				{loading ? "Расчёт..." : "Рассчитать"}
			</button>
			<pre style={{ whiteSpace: "pre-wrap", marginTop: "1em" }}>{result}</pre>
		</div>
	);
};

export default PriceIncreaseCalculator;
