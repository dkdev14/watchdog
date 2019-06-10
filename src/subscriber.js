const Web3  = require('web3');
const BigNumber = require('bignumber.js');
require('./env');

// "Web3.givenProvider" will be set if in an Ethereum supported browser.
const web3 = new Web3(new Web3.providers.WebsocketProvider(`wss://${getNetwork()}.infura.io/ws/v3/${process.env.NODE}`));

/**
 * watch ethereum network for particular account
 * and send cancel tx if any unauthorised tx occurs
 */
async function watch(address){
    const subscription = web3.eth.subscribe('pendingTransactions', function(error, result){
        if (!error)
            console.log("res :: " + result);
    })
    
    console.log(`Subscribed to the ${getNetwork()} network...`);
    subscription.on("data", async function(transaction){
        console.log(transaction)
        const tx = await web3.eth.getTransaction(transaction);
        console.log(tx);
        if(tx && tx.from === address){
            //TODO: filters for selections of unauthorised txs
            await sendCancelTx(tx, process.env.INCREASED_GAS_PRICE, process.env.KEY);
        }
    });
}

/**
 * prepare and send cancel transaction to ethereum network
 * @param {*} txToCancel - tx to cancel
 * @param {*} increaseGasBy - % increase in gasPrice (min - 10)
 * @param {*} key - private key to sign tx offchain
 */
async function sendCancelTx(txToCancel, increaseGasBy, key){
    let privKey = new Buffer.from(key, 'hex');
    //check if address has enough balance
    let gasPriceFactor = 1 + Number(increaseGasBy) * 0.01;
    let hasGas = await hasEnoughGas(txToCancel, gasPriceFactor);

    if(!hasGas){
        throw new Error('not enough balance to send cancel tx...');
    }
    //prepare tx
    let gasPrice = new BigNumber(txToCancel.gasPrice);
    let newGasPrice = gasPrice.multipliedBy(gasPriceFactor);
    let cancelTx = {
        "from": txToCancel.from,
        "nonce": txToCancel.nonce,
        "gasPrice": web3.utils.toHex(newGasPrice),
        "gasLimit": web3.utils.toHex(txToCancel.gasLimit),
        "to": txToCancel.from,
        "value": 0,
        "chainId": process.env.CHAIN_ID //1 for mainnet, 3 for ropsten, 4 for rinkeby
    };
    let tx = new Tx(cancelTx);

    //sign tx
    tx.sign(privKey);

    //send tx
    let serializedTx = tx.serialize();
    let signedTx = web3.eth.sendSignedTransaction('0x' + serializedTx.toString('hex'))
    console.log('Sent cancel tx to network');
    //wait for tx confirmation
    signedTx.on('transactionHash',function(hash){
        console.log(`Cancel tx sent to network with tx hash -  ${hash}`);
    })
    
    signedTx.on('confirmation', function(confirmation, receipt){
        console.log(receipt)
        //on 12th confirmation, its relatively safe that tx is processed
        //so we start another tx
        if(parseInt(confirmation) > 12){
            //stop listening to this tx events
            signedTx.off('confirmation');
            console.log('TRANSACTION CANCELLED SUCCESSFULLY...');
        }
        
    })
    .on('error', console.error);
}

/**
 * throws if account doesn't have enough gas to process cancel tx
 * @param {*} tx - tx to be cancelled
 * @param {*} gasPriceFactor - increase in % for gas price
 */
async function hasEnoughGas(tx, gasPriceFactor){
    //get balance of current account
    let balance = await web3.eth.getBalance(tx.from);
    let bal =  new BigNumber(balance);
    let gasPrice = new BigNumber(tx.gasPrice);
    let gasLimit = new BigNumber(tx.gasLimit);
    return bal.minus(gasLimit).isLessThan(gasPrice.multipliedBy(gasPriceFactor));
}

/**
 * select network based on chainId
 */
function getNetwork(){
    let networkId = process.env.CHAIN_ID;
    switch(Number(networkId)){
        case 1:
            return 'mainnet';
        default:
            return 'rinkeby';
    }
}

try{
    watch(process.env.ACCOUNT_TO_WATCH);
}
catch(error){
    console.error(error.message);
}
