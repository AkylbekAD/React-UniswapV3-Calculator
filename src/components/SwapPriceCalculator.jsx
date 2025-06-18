import React, { useState } from "react";
import { ethers } from "ethers";
import QuoterV2 from "@uniswap/v3-periphery/artifacts/contracts/lens/QuoterV2.sol/QuoterV2.json";
const QuoterV2ABI = QuoterV2.abi;
import Pool from "@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json";
const PoolABI = Pool.abi;
import Factory from "@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json";
const FactoryABI = Factory.abi;
import ERC20ABI from "../erc20.json";
import { NETWORKS } from "../config/net_configs";

const SwapPriceCalculator = () => {
	const [token0, setToken0] = useState(
		"0x2d8ecB8Dd7a70E49f70F5224AF7573078Ec20052"
	);
	const [token1, setToken1] = useState(
		"0x55d398326f99059fF775485246999027B3197955"
	);
	const [amount0, setAmount0] = useState("");
	const [amount1, setAmount1] = useState("");
	const [fee, setFee] = useState("100");
	const [network, setNetwork] = useState("bsc_mainnet");
	const [result, setResult] = useState("");
	const [loading, setLoading] = useState(false);

	const simulateSwap = async (tokenIn, tokenOut, amountInRaw, provider, net) => {
		const factory = new ethers.Contract(
			net.FACTORY_ADDRESS,
			FactoryABI,
			provider
		);
		const poolAddress = await factory.getPool(tokenIn, tokenOut, parseInt(fee));
		const poolContract = new ethers.Contract(poolAddress, PoolABI, provider);
		const slot0 = await poolContract.slot0();
		const sqrtPriceX96 = slot0.sqrtPriceX96;

		const token0Address = await poolContract.token0();
		const token0IsInput = tokenIn.toLowerCase() === token0Address.toLowerCase();

		const tokenInContract = new ethers.Contract(tokenIn, ERC20ABI, provider);
		const tokenOutContract = new ethers.Contract(tokenOut, ERC20ABI, provider);

		const decimalsIn = await tokenInContract.decimals();
		const decimalsOut = await tokenOutContract.decimals();

		const tokenInName = await tokenInContract.name();
		const tokenOutName = await tokenOutContract.name();

		const quoter = new ethers.Contract(
			net.QUOTER2_ADDRESS,
			QuoterV2ABI,
			provider
		);

		const amountIn = ethers.utils.parseUnits(amountInRaw.toString(), decimalsIn);

		const params = {
			tokenIn: tokenIn,
			tokenOut: tokenOut,
			fee: parseInt(fee),
			amountIn: amountIn,
			sqrtPriceLimitX96: "0",
		};

		const quote = await quoter.callStatic.quoteExactInputSingle(params);
		const sqrtPriceX96After = quote.sqrtPriceX96After;

		const sqrtToPrice = (sqrt, decimals0, decimals1, token0IsInput) => {
			const numerator = sqrt ** 2;
			const denominator = 2 ** 192;
			let ratio = numerator / denominator;
			const shiftDecimals = Math.pow(10, decimals0 - decimals1);
			ratio = ratio * shiftDecimals;
			return token0IsInput ? ratio : 1 / ratio;
		};

		const priceBefore = sqrtToPrice(
			sqrtPriceX96,
			decimalsIn,
			decimalsOut,
			token0IsInput
		);
		const priceAfter = sqrtToPrice(
			sqrtPriceX96After,
			decimalsIn,
			decimalsOut,
			token0IsInput
		);

		const percentChange = ((priceAfter - priceBefore) / priceBefore) * 100;

		let output = `\n💱 Swap ${amountInRaw} ${tokenInName} → ${tokenOutName}\n`;
		output += `Цена до: 1 ${tokenInName} = ${priceBefore} ${tokenOutName}\n`;
		output += `Цена после: 1 ${tokenInName} = ${priceAfter} ${tokenOutName}\n`;
		output += `Изменение: ${percentChange.toFixed(4)} %\n`;

		return output;
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		setLoading(true);
		setResult("Загрузка...");

		try {
			const net = NETWORKS[network];
			const provider = new ethers.providers.JsonRpcProvider(net.URL);
			let output = "";

			if (amount0) {
				output += await simulateSwap(token0, token1, amount0, provider, net);
			}
			if (amount1) {
				output += await simulateSwap(token1, token0, amount1, provider, net);
			}

			setResult(output);
		} catch (e) {
			console.error(e);
			setResult("Ошибка при расчёте");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className='calculator'>
			<h2>Калькулятор курса после свапа</h2>
			<form onSubmit={handleSubmit}>
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
					placeholder='Amount Token0'
					value={amount0}
					onChange={(e) => setAmount0(e.target.value)}
				/>
				<input
					type='number'
					placeholder='Amount Token1'
					value={amount1}
					onChange={(e) => setAmount1(e.target.value)}
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
				<button type='submit' disabled={loading}>
					{loading ? "Рассчёт..." : "Рассчитать"}
				</button>
			</form>
			<pre style={{ whiteSpace: "pre-wrap", marginTop: "1em" }}>{result}</pre>
		</div>
	);
};

export default SwapPriceCalculator;
