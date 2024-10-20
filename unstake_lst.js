const { ethers } = require('ethers');
const path = require('path');
const { getMnemonicFromKeystore } = require('fs-base/builder/wallet');
const { mergeRpcList } = require("fs-base/constant/rpc");
const { createLog, createNotify, catchException } = require("fs-base/utils/index");
const { default: Multicall } = require("fs-base/utils/multicall");
const { rpcList, keystore, chainId, notify: { channel, token }, maxGasPrice, start, end } = require('./.env.js');
const log = createLog(path.resolve(__dirname, './'));
const notify = createNotify(channel, token);
const multicall = new Multicall();

const mergedRpcList = mergeRpcList(rpcList, chainId);
const provider = new ethers.providers.JsonRpcProvider(mergedRpcList[0]);
const abi = [
    {
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
    },
    {
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
    }
]

const interval = chainId === 1 ? 12 * 1000 : 1 * 1000;

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

        const { stg, amount: data } = await getData(wallet.address, index);

        log(`account ${index} address ${wallet.address}, balance is ${ethers.utils.formatEther(data)}, stg ${stg}`);

        if (data.lte(0)) {
            log(`❌ account ${index} address ${wallet.address}, Insufficient Balance`);
            continue;
        }

        //3.构造deposit交易
        const contract = new ethers.Contract('0x39053D51B77DC0d36036Fc1fCc8Cb819df8Ef37A', abi, wallet);

        console.log('queueWithdrawals');

        const tx = await contract.queueWithdrawals([
            {
                strategies: [stg],
                shares: [data],
                withdrawer: wallet.address,
            }
        ], {
            maxPriorityFeePerGas: ethers.utils.parseUnits(String(parseInt((Math.random()*0.05 + 0.05)*1000)/1000),'gwei')
        });

        log(`account ${index} address ${wallet.address} send tx: ${tx.hash}`);

        await tx.wait();

        log('✅tx success', tx.hash);

        await new Promise(resolve => setTimeout(resolve, Math.ceil(Math.random() * 60) * 1000 + interval));
    }

    log('ended');
}

async function getData(address,index) {
    const calls = [
        {
            address: '0x858646372CC42E1A627fcE94aa7A7033e7CF075A', 
            abi,
            method: 'getDeposits',
            params: [address]
        }
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

                const len = balance[0].length;
                
                if(!len) return resolve(ethers.BigNumber.from(0));
                if(len > 1) notify(`index ${index} ${address} has multi LST deposits`);
                
                resolve({
                    stg: balance[0][0],
                    amount: balance[1][0]
                });
            } catch (error) {
                log('get balance error', error.toString());

                setTimeout(request, 1000);
            }
        }

        request();
    })
}

async function validGasPrice() {
    return new Promise(resolve => {
        const request = async () => {
            try {
                const res = await provider.getGasPrice();
                const gasPrice = parseInt(ethers.utils.formatUnits(res, 'gwei'));

                console.log('current gas price is ', gasPrice);

                currentGasPrice = Number(gasPrice);

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
