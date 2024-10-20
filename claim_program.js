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
 const { rpcList, keystore, gasPrice, start, end, chainId, notify: { channel, token }, tokenContract, maxGasPrice } = require('./.env_program.js');
 const { default: axios } = require('axios');
 const multicall = new Multicall();
 
 const log = createLog(path.resolve(__dirname, './'));
 const notify = createNotify(channel, token);
 
 const mergedRpcList = mergeRpcList(rpcList, chainId);
 const provider = new ethers.providers.JsonRpcProvider('https://eth-mainnet.g.alchemy.com/v2/TabWECCgw6LuDjMdURpYU-3E4MAF_l6c');
 const reverseEth = 0.1;
 const interval = chainId === 1 ? 10 * 1000 : 1 * 1000;
 
 
 const ABI = [{
    "inputs": [
        {
            "components": [
                {
                    "internalType": "uint32",
                    "name": "rootIndex",
                    "type": "uint32"
                },
                {
                    "internalType": "uint32",
                    "name": "earnerIndex",
                    "type": "uint32"
                },
                {
                    "internalType": "bytes",
                    "name": "earnerTreeProof",
                    "type": "bytes"
                },
                {
                    "components": [
                        {
                            "internalType": "address",
                            "name": "earner",
                            "type": "address"
                        },
                        {
                            "internalType": "bytes32",
                            "name": "earnerTokenRoot",
                            "type": "bytes32"
                        }
                    ],
                    "internalType": "struct IRewardsCoordinator.EarnerTreeMerkleLeaf",
                    "name": "earnerLeaf",
                    "type": "tuple"
                },
                {
                    "internalType": "uint32[]",
                    "name": "tokenIndices",
                    "type": "uint32[]"
                },
                {
                    "internalType": "bytes[]",
                    "name": "tokenTreeProofs",
                    "type": "bytes[]"
                },
                {
                    "components": [
                        {
                            "internalType": "contract IERC20",
                            "name": "token",
                            "type": "address"
                        },
                        {
                            "internalType": "uint256",
                            "name": "cumulativeEarnings",
                            "type": "uint256"
                        }
                    ],
                    "internalType": "struct IRewardsCoordinator.TokenTreeMerkleLeaf[]",
                    "name": "tokenLeaves",
                    "type": "tuple[]"
                }
            ],
            "internalType": "struct IRewardsCoordinator.RewardsMerkleClaim",
            "name": "claim",
            "type": "tuple"
        },
        {
            "internalType": "address",
            "name": "recipient",
            "type": "address"
        }
    ],
    "name": "processClaim",
    "outputs": [

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

         //1.生成账户
         let wallet = ethers.Wallet.fromMnemonic(mnemonic, `m/44'/60'/0'/0/${index}`);
         wallet = wallet.connect(provider);
 
         log(`account ${index} address ${wallet.address}`);
         
         await validGasPrice();
         
 
         // //2.获取账户余额
        //  const hasClaimed = await getBalance(wallet.address);

        //  if(hasClaimed) {
        //      notify(`account ${index} address ${wallet.address} has claimed`);
        //      continue;
        //  }

         const proof = await getData(wallet.address);
         const amount = Number(ethers.utils.formatEther(proof.tokenLeaves[0].cumulativeEarnings));
         
         log(`account ${index} address ${wallet.address} claim ${amount} EIGEN`)
        
         if(amount < 1) {
            log('skipped');
            notify(`account ${index} address ${wallet.address} ${amount} EIGEN, skipped`);
            continue;
         }

         await claim(wallet, index, proof);
 
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
 
 async function getData(address) {
    return new Promise((resolve,reject) => {
        let count = 0;
        
      const request = async () => {
          try {
              const res = await axios.get(`https://app.eigenlayer.xyz/api/trpc/rewards.getClaimProofs?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22earner%22%3A%22${address}%22%2C%22tokenAddress%22%3A%5B%220xec53bf9167f50cdeb3ae105f56099aaab9061f83%22%5D%7D%7D%7D`, {
                headers: {
                  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                  "accept": "application/json, text/plain, */*",
                  "accept-language": "zh-CN,zh;q=0.9",
                  "priority": "u=1, i",
                  "request-id": "|221d7241c5c6448abbb2d03d7ba0b2ad.1cb0e2eeb378420b",
                  "sec-ch-ua": "\"Chromium\";v=\"128\", \"Not;A=Brand\";v=\"24\", \"Google Chrome\";v=\"128\"",
                  "sec-ch-ua-mobile": "?0",
                  "sec-ch-ua-platform": "\"macOS\"",
                  "sec-fetch-dest": "empty",
                  "sec-fetch-mode": "cors",
                  "sec-fetch-site": "same-origin",
                  "traceparent": "00-221d7241c5c6448abbb2d03d7ba0b2ad-1cb0e2eeb378420b-01",
                  "cookie": "GCLB=\"7d8dd2a2f2e5c63a\"; ai_user=mEd/f56PZcGuxoB9tXKVnT|2024-09-18T06:10:05.021Z; _ga=GA1.1.606248995.1726639805; _ga_4R5XEV93DT=GS1.1.1726639805.1.0.1726639805.0.0.0; wagmi.recentConnectorId=\"io.metamask\"; wagmi.store={\"state\":{\"connections\":{\"__type\":\"Map\",\"value\":[[\"e1463d4f1c9\",{\"accounts\":[\"0x787EE6988F8e9Bc6efD4c700118764336c3360B3\"],\"chainId\":1,\"connector\":{\"id\":\"io.metamask\",\"name\":\"MetaMask\",\"type\":\"injected\",\"uid\":\"e1463d4f1c9\"}}]]},\"chainId\":1,\"current\":\"e1463d4f1c9\"},\"version\":2}; ai_session=sJSQNKm3VFbNXStpQNbtyS|1726639805114|1726640076922",
                  "Referer": "https://claims.eigenfoundation.org/",
                  "Referrer-Policy": "strict-origin-when-cross-origin"
                }
              });
  
              const proof = res.data[0].result.data.json.proof;
  
              resolve({
                rootIndex: proof.rootIndex,
                earnerIndex: proof.earnerIndex,
                earnerTreeProof: proof.earnerTreeProof,
                earnerLeaf: proof.earnerLeaf,
                tokenIndices: proof.leafIndices,
                tokenTreeProofs: proof.tokenTreeProofs,
                tokenLeaves: proof.tokenLeaves,
              });
          } catch (error) {
            count ++;
            if(count > 3) return reject(error);

              console.log(error.toString());
              setTimeout(request, 1000);
          }
      }
  
      request();
  })
  }
   
 
 
 async function claim(wallet, index, proof) {
     // //2.构造approve交易
     const contract1 = new ethers.Contract('0x7750d328b314EfFa365A0402CcfD489B80B0adda', ABI, wallet);
 
     //4.广播
     const tx1 = await contract1.processClaim(proof, wallet.address, {
        //  gasLimit: 200000 + Math.ceil(Math.random() * 50000),
        //  maxPriorityFeePerGas: ethers.utils.parseUnits((Math.random()*1.5+0.2).toFixed(8), 'gwei'),
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
 
