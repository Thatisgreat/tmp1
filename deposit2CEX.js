 const { ethers } = require('ethers');
 const path = require('path');
 const fs = require('fs');
 const { getMnemonicFromKeystore } = require('fs-base/builder/wallet');
 const { mergeRpcList, eth } = require("fs-base/constant/rpc");
 const { default: Multicall } = require("fs-base/utils/multicall");
 const { createLog, createNotify, catchException } = require("fs-base/utils/index");
 const { rpcList, keystore, gasPrice, start, end, chainId, notify: { channel, token }, tokenContract, maxGasPrice } = require('./.env_deposit2cex.js');
 const { default: axios } = require('axios');
 const multicall = new Multicall();
 
 const log = createLog(path.resolve(__dirname, './'));
 const notify = createNotify(channel, token);
 
 const mergedRpcList = mergeRpcList(rpcList, chainId);
 const provider = new ethers.providers.JsonRpcProvider('https://eth-mainnet.g.alchemy.com/v2/TabWECCgw6LuDjMdURpYU-3E4MAF_l6c');
 const reverseEth = 0.1;
 const interval = chainId === 1 ? 10 * 1000 : 1 * 1000;
 
 const cexList = require('./cex.json');
 const depositLogs = require('./deposit_cex_logs.json');
 
 const ABI = [{
    "inputs": [
        {
            "internalType": "address",
            "name": "account",
            "type": "address"
        }
    ],
    "name": "balanceOf",
    "outputs": [
        {
            "internalType": "uint256",
            "name": "",
            "type": "uint256"
        }
    ],
    "stateMutability": "view",
    "type": "function"
},{
    "inputs": [
        {
            "internalType": "address",
            "name": "to",
            "type": "address"
        },
        {
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
        }
    ],
    "name": "transfer",
    "outputs": [
        {
            "internalType": "bool",
            "name": "",
            "type": "bool"
        }
    ],
    "stateMutability": "nonpayable",
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

         if(index >= 751 && index < 1001) {
            log(`account ${index} skipped`);
            continue;
         }
         if(index >= 1376 && index < 1501) {
            log(`account ${index} skipped`);
            continue;
         }

         //1.生成账户
         let wallet = ethers.Wallet.fromMnemonic(mnemonic, `m/44'/60'/0'/0/${index}`);
         wallet = wallet.connect(provider);
 
         log(`account ${index} address ${wallet.address}`);
         
         await validGasPrice();
         
 
         // //2.获取账户余额
         const balance = await getBalance(wallet.address);

         log(`account ${index} address ${wallet.address} has ${ethers.utils.formatEther(balance)} EIGEN`);

         if(balance.lte(ethers.utils.parseEther('0.1'))) {
             log(`account ${index} address ${wallet.address} no balance`);
             notify(`account ${index} address ${wallet.address} no balance`);
             continue;
         }

         const cexInfo = cexList[wallet.address.toLowerCase()];

         if(!cexInfo) throw new Error(`account ${index} address ${wallet.address} no cexInfo`);

         const { to, owner, name, index: indexFromCexInfo } = cexInfo;

         if(Number(indexFromCexInfo) !== index) throw new Error(`account ${index} address ${wallet.address} cexInfo index nomatch ${index} !== ${indexFromCexInfo}`);

         log(`account ${index} address ${wallet.address} transfer ${ethers.utils.formatEther(balance)} EIGEN to ${owner}'s ${name} ${to}`);



         await transfer(wallet, index, balance, to);
//await transfer(wallet, index, ethers.utils.parseEther('1'), to);


         depositLogs.push({
            index,
            address: wallet.address,
            balance: balance.toString(),
            amount: ethers.utils.formatEther(balance),
            cexInfo
         })

         fs.writeFileSync('./deposit_cex_logs.json', JSON.stringify(depositLogs, null, 2));
 
         log('✅ txs successful');
         const randomInterval = parseInt(Math.random() * 60) * 1000;
         const lasterInterval = chainId === 1 ? interval + randomInterval : interval + randomInterval;
 
         await new Promise(resolve => setTimeout(resolve, lasterInterval));
     }
 
     log('ended');
 }
 
 async function getBalance(address) {
     log('get balance');
     const calls = [
         {
             address: '0xec53bf9167f50cdeb3ae105f56099aaab9061f83', //
             abi: ABI,
             method: 'balanceOf',
             params: [address]
         },
     ];
 
     return new Promise(resolve => {
         const request = async () => {
             try {
                 const [balance] = await multicall.call({
                     calls,
                     provider,
                     chainId,
                     isStrict: false
                 });

                 resolve(balance);
             } catch (error) {
                 log('get balance error', error.toString());
 
                 setTimeout(request, 1000);
             }
         }
 
         request();
     })
 }
 
 function getData(address) {
    const params = paramsData.find(item => {
      console.log(Object.keys(item)[0]);
      return Object.keys(item)[0] === address
    });

    if(!params) {
      throw new Error(`address ${address} no params`);
    }

    return params[address];
}
 
 
 async function transfer(wallet, index, amount, to) {
     // //2.构造approve交易
     const contract1 = new ethers.Contract('0xec53bf9167f50cdeb3ae105f56099aaab9061f83', ABI, wallet);
 
     //4.广播
     const tx1 = await contract1.transfer(to, amount, {
         gasLimit: 100000 + Math.ceil(Math.random() * 50000),
         maxPriorityFeePerGas: ethers.utils.parseUnits((Math.random()*2+0.2).toFixed(8), 'gwei'),
     });
 
     log(`[transfer] account ${index} address ${wallet.address} send tx: ${tx1.hash}`);
 
     await tx1.wait();
 
     log('tx success');
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
 
