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
 const { rpcList, keystore, gasPrice, start, end, chainId, notify: { channel, token }, tokenContract, maxGasPrice } = require('./.env_undelegate.js');
 const { default: axios } = require('axios');
 const multicall = new Multicall();
 
 const log = createLog(path.resolve(__dirname, './'));
 const notify = createNotify(channel, token);
 
 const mergedRpcList = mergeRpcList(rpcList, chainId);
 const provider = new ethers.providers.JsonRpcProvider('https://eth-mainnet.g.alchemy.com/v2/TabWECCgw6LuDjMdURpYU-3E4MAF_l6c');
 const reverseEth = 0.1;
 const interval = chainId === 1 ? 0 * 60 * 1000 : 1 * 1000;
 
 const walletClaimData = require('./test.json');
 
 const ABI = [{
    "inputs": [
        {
            "internalType": "address",
            "name": "",
            "type": "address"
        },
        {
            "internalType": "contract IStrategy",
            "name": "",
            "type": "address"
        }
    ],
    "name": "stakerStrategyShares",
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
            "components": [
                {
                    "internalType": "contract IStrategy[]",
                    "name": "strategies",
                    "type": "address[]"
                },
                {
                    "internalType": "uint256[]",
                    "name": "shares",
                    "type": "uint256[]"
                },
                {
                    "internalType": "address",
                    "name": "withdrawer",
                    "type": "address"
                }
            ],
            "internalType": "struct IDelegationManager.QueuedWithdrawalParams[]",
            "name": "queuedWithdrawalParams",
            "type": "tuple[]"
        }
    ],
    "name": "queueWithdrawals",
    "outputs": [
        {
            "internalType": "bytes32[]",
            "name": "",
            "type": "bytes32[]"
        }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
}]
 
 const delegateIndexMap = {
     501: '0xcaaeb411241ac87b5846797c15bf339a54a1d736',  //0-500    cs1
     651: '0xa4de33c36e123c4a2c677c8955bed02f847695f2', //501-650 cs2
     751: '0xa026265a0f01a6e1a19b04655519429df0a57c4e', //650-751 Stake.Fish 
     801: '0xa269a19b31b193acae86cc3c9f4c28ead66e11eb', //751-801 ChainBase
     901: '0xdbed88d83176316fc46797b43adee927dc2ff2f5', //801-901 P2P.org
     1001: '0x5accc90436492f24e6af278569691e2c942a676d', //901-1001 EigenYields
 };
 
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
         //1.生成账户
         let wallet = ethers.Wallet.fromMnemonic(mnemonic, `m/44'/60'/0'/0/${index}`);
         wallet = wallet.connect(provider);
 
         log(`account ${index} address ${wallet.address}`);
 
         await validGasPrice();
 
         // //2.获取账户余额
         const amount = await getBalance(wallet.address);
 
         log(`amount ${ethers.utils.formatEther(amount)} `);
 
         if(!amount) {
             log(`account ${index} address ${wallet.address} no amount`);
             continue;
         }
 
         
         log('undelegating...')
         await undeposit(wallet, index, amount);
 
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
             address: '0x858646372cc42e1a627fce94aa7a7033e7cf075a', //
             abi: ABI,
             method: 'stakerStrategyShares',
             params: [address, '0xaCB55C530Acdb2849e6d4f36992Cd8c9D50ED8F7']
         }
     ];
 
     return new Promise(resolve => {
         const request = async () => {
             try {
                 const [amount] = await multicall.call({
                     calls,
                     provider,
                     chainId,
                     isStrict: false
                 });
 
                 resolve(amount);
             } catch (error) {
                 log('get balance error', error.toString());
 
                 setTimeout(request, 1000);
             }
         }
 
         request();
     })
 }
 
 
 
 
 
 async function undeposit(wallet, index, amount) {
     // //2.构造approve交易
     const contract1 = new ethers.Contract('0x39053D51B77DC0d36036Fc1fCc8Cb819df8Ef37A', ABI, wallet);
 
     //4.广播
     const tx1 = await contract1.queueWithdrawals([{
        strategies: ['0xaCB55C530Acdb2849e6d4f36992Cd8c9D50ED8F7'],
        shares: [amount],
        withdrawer: wallet.address
     }], {
         gasLimit: 200000 + Math.ceil(Math.random() * 50000)
     });
 
     log(`[undeposit] account ${index} address ${wallet.address} send tx: ${tx1.hash}`);
 
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
 
