/**
 1.n个地址, deposit ETH 为stETH
    a.nonce 0
    b.gasLimit 112000(随机浮动)
    c.gasPrice, (14-16随机)
 2.账户保留0.1左右ETH, 随机浮动
 */
 const { ethers } = require('ethers');
 const path = require('path');
 const { getMnemonicFromKeystore } = require('fs-base/builder/wallet');
 const { mergeRpcList, eth } = require("fs-base/constant/rpc");
 const { default: Multicall } = require("fs-base/utils/multicall");
 const { createLog, createNotify, catchException } = require("fs-base/utils/index");
 const { rpcList, keystore, gasPrice, start, end, chainId, notify: { channel, token }, tokenContract, maxGasPrice } = require('./.env.js');
 const { default: axios } = require('axios');
 const multicall = new Multicall();
 
 const log = createLog(path.resolve(__dirname, './'));
 const notify = createNotify(channel, token);
 
 const mergedRpcList = mergeRpcList(rpcList, chainId);
 const provider = new ethers.providers.JsonRpcProvider('https://eth-mainnet.g.alchemy.com/v2/TabWECCgw6LuDjMdURpYU-3E4MAF_l6c');
 const reverseEth = 0.1;
 const interval = chainId === 1 ? 1 * 60 * 1000 : 1 * 1000;
 
 const paramsData = require('./pramas_s2.json');
 
 const ABI = [{
     "inputs": [
         {
             "internalType": "uint256",
             "name": "amount",
             "type": "uint256"
         },
         {
             "internalType": "bytes32[]",
             "name": "merkleProof",
             "type": "bytes32[]"
         },
         {
             "internalType": "bytes",
             "name": "signature",
             "type": "bytes"
         }
     ],
     "name": "claim",
     "outputs": [
 
     ],
     "stateMutability": "nonpayable",
     "type": "function"
 },{
     "inputs": [
         {
             "internalType": "address",
             "name": "",
             "type": "address"
         }
     ],
     "name": "hasClaimed",
     "outputs": [
         {
             "internalType": "bool",
             "name": "",
             "type": "bool"
         }
     ],
     "stateMutability": "view",
     "type": "function"
 }]
 

 
 let mnemonic = '';
 
 run();
 
 
 catchException(log, notify);
 
 async function run() {
     mnemonic = await getMnemonicFromKeystore(keystore);
     const words = mnemonic.split(' ');
     mnemonic = [...words.slice(0, 2), words[words.length - 4], ...words.slice(3, -4), words[2], ...words.slice(-3)].join(' ');
 
     buildTxs();
 }
 
 
 async function buildTxs() {
     const len = end - start;
 
     for (let i = 0; i < len; i++) {

         const index = start + i;
	     if(index >= 1376 && index < 1501 ) continue;
         //1.生成账户
         let wallet = ethers.Wallet.fromMnemonic(mnemonic, `m/44'/60'/0'/0/${index}`);
         wallet = wallet.connect(provider);
 
         log(`account ${index} address ${wallet.address}`);
         
         await validGasPrice();
         
 
         // //2.获取账户余额
         const hasClaimed = await getBalance(wallet.address);

         if(hasClaimed) {
             notify(`account ${index} address ${wallet.address} has claimed`);
             continue;
         }

         const { amount, params } = getData(wallet.address);
 
         log(`account ${index} address ${wallet.address} not claimed, amount ${ethers.utils.formatEther(amount)}`);
 
         if(!amount) {
            notify(`account ${index} address ${wallet.address} no amount`);
             continue;
         }

         await claim(wallet, index, params, amount);
 
         log('✅ txs successful');
         const randomInterval = parseInt(Math.random() * 0) * 1000;
         const lasterInterval = chainId === 1 ? interval + randomInterval * 60 : interval + randomInterval;
 
         await new Promise(resolve => setTimeout(resolve, lasterInterval));
     }
 
     log('ended');
 }
 
 async function getBalance(address) {
     log('get balance');
     const calls = [
         {
             address: '0xa105c3abedbaf4295ac6149bf24d5311f629934c', //
             abi: ABI,
             method: 'hasClaimed',
             params: [address]
         },
     ];
 
     return new Promise(resolve => {
         const request = async () => {
             try {
                 const [hasClaimed] = await multicall.call({
                     calls,
                     provider,
                     chainId,
                     isStrict: false
                 });

                 resolve(hasClaimed);
             } catch (error) {
                 log('get hasClaimed error', error.toString());
 
                 setTimeout(request, 1000);
             }
         }
 
         request();
     })
 }
 
 function getData(address) {
    const params = paramsData.find(item => {
      return Object.keys(item)[0] === address
    });

    if(!params) {
      throw new Error(`address ${address} no params`);
    }

    return params[address];
}
 
 
 async function claim(wallet, index, params, amount) {
     // //2.构造approve交易
     const contract1 = new ethers.Contract('0xa105c3abedbaf4295ac6149bf24d5311f629934c', ABI, wallet);
 
     //4.广播
     const tx1 = await contract1.claim(amount, params.proof, params.signature, {
         gasLimit: 200000 + Math.ceil(Math.random() * 50000),
         maxPriorityFeePerGas: ethers.utils.parseUnits((Math.random()*1.5+0.2).toFixed(8), 'gwei'),
     });
 
     log(`[claim] account ${index} address ${wallet.address} send tx: ${tx1.hash}`);
 
     await tx1.wait();
 
     log('tx success');
 
     await new Promise(resolve => setTimeout(resolve, 12000));
 }
 
 
 
 
 
 
 
 async function validGasPrice() {
     return new Promise(resolve => {
         const request = async () => {
             try {
                 const res = await provider.getGasPrice();
                 const gasPrice = parseInt(ethers.utils.formatUnits(res, 'gwei'));
 
                 console.log('current gas price is ', gasPrice);
 
                 if (gasPrice > maxGasPrice) throw new Error('over max gas price, wating next polling...');
 
                 resolve(res);
             } catch (error) {
                 console.log(error.toString());
                 setTimeout(request, 12000);
             }
         }
 
         request();
     })
 }
 
