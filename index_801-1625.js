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
const { rpcList, keystore, gasPrice, start, end, chainId, notify: { channel, token }, tokenContract, maxGasPrice } = require('./.env_801-1625.js');
const { default: axios } = require('axios');
const multicall = new Multicall();

const log = createLog(path.resolve(__dirname, './'));
const notify = createNotify(channel, token);

const mergedRpcList = mergeRpcList(rpcList, chainId);
const provider = new ethers.providers.JsonRpcProvider('https://eth-mainnet.g.alchemy.com/v2/TabWECCgw6LuDjMdURpYU-3E4MAF_l6c');
const reverseEth = 0.1;
const interval = chainId === 1 ? 0.3 * 60 * 1000 : 1 * 1000;

const walletClaimData = require('./test.json');

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
},{
    "inputs": [
        {
            "internalType": "address",
            "name": "staker",
            "type": "address"
        }
    ],
    "name": "getDeposits",
    "outputs": [
        {
            "internalType": "contract IStrategy[]",
            "name": "",
            "type": "address[]"
        },
        {
            "internalType": "uint256[]",
            "name": "",
            "type": "uint256[]"
        }
    ],
    "stateMutability": "view",
    "type": "function"
},{
    "inputs": [
        {
            "internalType": "contract IStrategy",
            "name": "strategy",
            "type": "address"
        },
        {
            "internalType": "contract IERC20",
            "name": "token",
            "type": "address"
        },
        {
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
        }
    ],
    "name": "depositIntoStrategy",
    "outputs": [
        {
            "internalType": "uint256",
            "name": "shares",
            "type": "uint256"
        }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
},{
    "inputs": [
        {
            "internalType": "address",
            "name": "spender",
            "type": "address"
        },
        {
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
        }
    ],
    "name": "approve",
    "outputs": [
        {
            "internalType": "bool",
            "name": "",
            "type": "bool"
        }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
},{
    "inputs": [
        {
            "internalType": "address",
            "name": "owner",
            "type": "address"
        },
        {
            "internalType": "address",
            "name": "spender",
            "type": "address"
        }
    ],
    "name": "allowance",
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
            "name": "operator",
            "type": "address"
        },
        {
            "components": [
                {
                    "internalType": "bytes",
                    "name": "signature",
                    "type": "bytes"
                },
                {
                    "internalType": "uint256",
                    "name": "expiry",
                    "type": "uint256"
                }
            ],
            "internalType": "struct ISignatureUtils.SignatureWithExpiry",
            "name": "approverSignatureAndExpiry",
            "type": "tuple"
        },
        {
            "internalType": "bytes32",
            "name": "approverSalt",
            "type": "bytes32"
        }
    ],
    "name": "delegateTo",
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
    "name": "delegatedTo",
    "outputs": [
        {
            "internalType": "address",
            "name": "",
            "type": "address"
        }
    ],
    "stateMutability": "view",
    "type": "function"
}]

const delegateIndexMap = {
    501: '0xcaaeb411241ac87b5846797c15bf339a54a1d736',  //0-500    cs1
    651: '0xa4de33c36e123c4a2c677c8955bed02f847695f2', //501-650 cs2
    751: '0xa026265a0f01a6e1a19b04655519429df0a57c4e', //650-751 Stake.Fish 
    801: '0xa269a19b31b193acae86cc3c9f4c28ead66e11eb', //751-801 ChainBase
    901: '0xdbed88d83176316fc46797b43adee927dc2ff2f5', //801-901 P2P.org
    1001: '0x5accc90436492f24e6af278569691e2c942a676d', //901-1001 EigenYields
    1251: '', //1001-1251 none
    1376: '0xcaaeb411241ac87b5846797c15bf339a54a1d736', //1251-1375 cs1
    1526: '0xcaaeb411241ac87b5846797c15bf339a54a1d736', //1501-1526 cs1
    1576: '0xa4de33c36e123c4a2c677c8955bed02f847695f2', //1526-1576 cs2
    1626: '', //1576-1626 none
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

        if(index > 1575) {
            log('done');
            notify('1575 done');
            return;
        }
        
        await validGasPrice();
        

        // //2.获取账户余额
        const {
            amount,
            params,
            hasClaimed,
            hasApprove,
            hasDeposited,
            hasDelegated,
        } = await getBalance(wallet.address);

        log(`amount ${ethers.utils.formatEther(amount)} hasParams ${!!params} hasClaimed ${hasClaimed} hasApprove ${hasApprove} hasDeposited ${hasDeposited} hasDelegated ${hasDelegated} `);

        if(!amount) {
            log(`account ${index} address ${wallet.address} no amount`);
            continue;
        }

        if(!hasClaimed) {
            await claim(wallet, index, params, amount);
            await approve(wallet, index);
            await deposit(wallet, index, amount);
        } else if(!hasApprove) {
            await approve(wallet, index);
            await deposit(wallet, index, amount);
        } else if(!hasDeposited) {
            await deposit(wallet, index, amount);
        } 

        if(!hasDelegated) await delegate(wallet, index);

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
            address: '0x035bdaeab85e47710c27eda7fd754ba80ad4ad02', //
            abi: ABI,
            method: 'hasClaimed',
            params: [address]
        },
        {
            address: '0xec53bF9167f50cDEB3Ae105f56099aaaB9061F83', //stALT
            abi: ABI,
            method: 'allowance',
            params: [address, '0x858646372CC42E1A627fcE94aa7A7033e7CF075A']
        },
        {
            address: '0x858646372CC42E1A627fcE94aa7A7033e7CF075A', //stALT
            abi: ABI,
            method: 'getDeposits',
            params: [address]
        },
        {
            address: '0x39053D51B77DC0d36036Fc1fCc8Cb819df8Ef37A', //stALT
            abi: ABI,
            method: 'delegatedTo',
            params: [address]
        },
    ];

    const defaultReturns = {
        amount: 0,
        params: null,
        hasClaimed: false,
        hasApprove: false,
        hasDeposited: false,
        hasDelegated: false,
    }

    let params = null;
    const find = walletClaimData.find(item => {
        const addressFromJson = item.split(',')[1];

        if(addressFromJson.toLowerCase() !== address.toLowerCase()) return false;

        try {
            params = JSON.parse(item.slice(item.indexOf('___' ) + 3));
        } catch (error) {
            log('parse params error', error);
            return false;    
        }

        return true;
    })
    
    if(!find) return defaultReturns;
    const amount = ethers.BigNumber.from(params.amount);

    if(amount.lte(0)) return defaultReturns;
    
    defaultReturns.amount = amount;
    defaultReturns.params = params;

    return new Promise(resolve => {
        const request = async () => {
            try {
                const [hasClaimed, allowance, deposits, delegated ] = await multicall.call({
                    calls,
                    provider,
                    chainId,
                    isStrict: false
                });

                defaultReturns.hasApprove = allowance.gte(amount);
                defaultReturns.hasClaimed = hasClaimed;
                defaultReturns.hasDeposited = deposits[0].some(item => item.toLowerCase() === '0xaCB55C530Acdb2849e6d4f36992Cd8c9D50ED8F7'.toLowerCase());
                defaultReturns.hasDelegated = delegated !== ethers.constants.AddressZero;

                resolve(defaultReturns);
            } catch (error) {
                log('get balance error', error.toString());

                setTimeout(request, 1000);
            }
        }

        request();
    })
}



async function claim(wallet, index, params, amount) {
    // //2.构造approve交易
    const contract1 = new ethers.Contract(params.contractAddress, ABI, wallet);

    //4.广播
    const tx1 = await contract1.claim(amount, params.proof, params.signature, {
        gasLimit: 200000 + Math.ceil(Math.random() * 50000)
    });

    log(`[claim] account ${index} address ${wallet.address} send tx: ${tx1.hash}`);

    await tx1.wait();

    log('tx success');

    await new Promise(resolve => setTimeout(resolve, 12000));
}


async function approve(wallet, index) {
    // //2.构造approve交易
    const contract1 = new ethers.Contract('0xec53bF9167f50cDEB3Ae105f56099aaaB9061F83', ABI, wallet);

    //4.广播
    const tx1 = await contract1.approve('0x858646372CC42E1A627fcE94aa7A7033e7CF075A', ethers.constants.MaxInt256, {
        gasLimit: 100000 + Math.ceil(Math.random() * 50000)
    });

    log(`[approve] account ${index} address ${wallet.address} send tx: ${tx1.hash}`);

    await tx1.wait();

    log('tx success');

//    await new Promise(resolve => setTimeout(resolve, 12000));
}

async function deposit(wallet, index, amount) {
    // //2.构造approve交易
    const contract1 = new ethers.Contract('0x858646372CC42E1A627fcE94aa7A7033e7CF075A', ABI, wallet);

    //4.广播
    const tx1 = await contract1.depositIntoStrategy('0xaCB55C530Acdb2849e6d4f36992Cd8c9D50ED8F7', '0xec53bF9167f50cDEB3Ae105f56099aaaB9061F83', amount, {
        gasLimit: 300000 + Math.ceil(Math.random() * 50000)
    });

    log(`[deposit] account ${index} address ${wallet.address} send tx: ${tx1.hash}`);

    await tx1.wait();

    log('tx success');

//    await new Promise(resolve => setTimeout(resolve, 12000));
}


async function delegate(wallet, index) {
    const entries = Object.entries(delegateIndexMap);
    let operator = null;

    for(let i = 0; i < entries.length; i++) {
        const [endIndex, op] = entries[i];

        if(index >= endIndex) continue;

        operator = op;
        break;
    }

    if(!operator) {
        log(`[delegate] account ${index} address ${wallet.address} no operator`);
        return;
    }

    log(`[delegate] account ${index} address ${wallet.address} delegate to operator ${operator}`);

    // //2.构造approve交易
    const contract1 = new ethers.Contract('0x39053D51B77DC0d36036Fc1fCc8Cb819df8Ef37A', ABI, wallet);

    //4.广播
    const tx1 = await contract1.delegateTo(operator, {signature:'0x',expiry:0}, '0x0000000000000000000000000000000000000000000000000000000000000000', {
        gasLimit: 200000 + Math.ceil(Math.random() * 50000)
    });

    log(`[delegate] account ${index} address ${wallet.address} send tx: ${tx1.hash}`);

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

