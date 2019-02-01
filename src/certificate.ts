import * as fs from 'fs';
import Web3 = require('web3');
import { onboardDemo } from './onboarding'
import { logger } from './Logger';

import * as Certificate from 'ew-origin-lib';
import * as User from 'ew-user-registry-lib'
import * as Asset from 'ew-asset-registry-lib'
import * as GeneralLib from 'ew-utils-general-lib';

import { AssetContractLookup, AssetProducingRegistryLogic, AssetConsumingRegistryLogic } from 'ew-asset-registry-contracts';
import { OriginContractLookup, CertificateLogic, migrateCertificateRegistryContracts } from 'ew-origin-contracts';
import { deployERC20TestToken, Erc20TestToken, TestReceiver, deployERC721TestReceiver } from 'ew-erc-test-contracts';



function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const certificateDemo = async(actionString: string, adminPrivateKey: string) => {

  const connectionConfig = JSON.parse(fs.readFileSync(process.cwd() + '/connection-config.json', 'utf8').toString());
  const action = JSON.parse(actionString);
  const contractConfig = JSON.parse(fs.readFileSync(process.cwd() + '/contractConfig.json', 'utf8').toString());

  const web3 = new Web3(connectionConfig.develop.web3);

  const adminPK = adminPrivateKey.startsWith('0x') ?
      adminPrivateKey : '0x' + adminPrivateKey;

  const adminAccount = web3.eth.accounts.privateKeyToAccount(adminPK);

  const assetProducingRegistryLogic = new AssetProducingRegistryLogic(web3, contractConfig.assetProducingRegistryLogic)
  const assetConsumingRegistryLogic = new AssetConsumingRegistryLogic(web3, contractConfig.assetConsumingRegistryLogic)
  const certificateLogic = new CertificateLogic(web3, contractConfig.certificateLogic)


  //blockchain configuration
  let conf: GeneralLib.Configuration.Entity;

  conf = {
      blockchainProperties: {
          activeUser: {
              address: adminAccount.address, privateKey: adminPK,
          },
          producingAssetLogicInstance: assetProducingRegistryLogic,
          consumingAssetLogicInstance: assetConsumingRegistryLogic,
          certificateLogicInstance: certificateLogic,
          web3,
      },
      offChainDataSource: {
          baseUrl: 'http://localhost:3030',
      },
      logger,
  };

  switch(action.type) {
    case "SAVE_SMARTMETER_READ_PRODUCING":

      console.log("-----------------------------------------------------------")

      conf.blockchainProperties.activeUser = {
        address: action.data.smartMeter, privateKey: action.data.smartMeterPK,
      };

      try {
        let asset = await (new Asset.ProducingAsset.Entity(action.data.assetId, conf).sync());
        await asset.saveSmartMeterRead(action.data.meterreading, action.data.filehash);
        asset = await asset.sync();
        console.log("Producing smart meter reading saved")
      } catch(e) {
        console.log("Error saving smart meter read for producing asset\n" + e)
      }

      console.log("-----------------------------------------------------------\n")

      break
    case "SAVE_SMARTMETER_READ_CONSUMING":
      console.log("-----------------------------------------------------------")

      conf.blockchainProperties.activeUser = {
        address: action.data.smartMeter, privateKey: action.data.smartMeterPK,
      };

      try {
        let asset = await (new Asset.ConsumingAsset.Entity(action.data.assetId, conf).sync());
        await asset.saveSmartMeterRead(action.data.meterreading, action.data.filehash);
        asset = await asset.sync();
        console.log("Consuming meter reading saved")
      } catch(e) {
        console.log("Error saving smart meter read for consuming asset\n" + e)
      }

      console.log("-----------------------------------------------------------\n")

      break

    case "INITIALIZE_CERTIFICATES":
      console.log("-----------------------------------------------------------")

      conf.blockchainProperties.activeUser = {
        address: adminAccount.address, privateKey: adminPK,
      };

      try {
        await assetProducingRegistryLogic.setMarketLookupContract(action.data.assetId, contractConfig.originContractLookup, { privateKey: action.data.assetOwnerPK });
        console.log("Certificates for Asset #" + action.data.assetId + " initialized")
      } catch(e) {
        console.log("Error intializing certificates\n" + e)
      }
      console.log("-----------------------------------------------------------")
      break

    case "TRANSFER_CERTIFICATE":
      console.log("-----------------------------------------------------------")

      conf.blockchainProperties.activeUser = {
        address: action.data.assetOwner , privateKey: action.data.assetOwnerPK,
      };

      try {
        console.log("Asset Owner Balance(BEFORE):",(await Certificate.TradableEntity.getBalance(action.data.assetOwner, conf)))
        console.log("Asset Owner Balance(BEFORE):",(await Certificate.TradableEntity.getBalance(action.data.addressTo, conf)))
        const certificate = await (new Certificate.Certificate.Entity(action.data.certId, conf).sync());
        await certificate.transferFrom(action.data.addressTo);
        console.log("Certificate Transferred")
        console.log("Asset Owner Balance(AFTER):",(await Certificate.TradableEntity.getBalance(action.data.assetOwner, conf)))
        console.log("Asset Owner Balance(AFTER):",(await Certificate.TradableEntity.getBalance(action.data.addressTo, conf)))
      } catch(e) {
        console.log("Error transferring certificates\n" + e)
      }


      console.log("-----------------------------------------------------------\n")
      break

    case "SPLIT_CERTIFICATE":
      console.log("-----------------------------------------------------------")

      conf.blockchainProperties.activeUser = {
        address: action.data.assetOwner , privateKey: action.data.assetOwnerPK,
      };

      try {
        let certificate = await (new Certificate.Certificate.Entity(action.data.certId, conf).sync());
        await certificate.splitCertificate(action.data.splitValue);
        certificate = await certificate.sync()

        console.log("Certificate Split into:", certificate.children)

        for(const cId of certificate.children) {
          const c = await(new Certificate.Certificate.Entity(cId.toString(), conf).sync());
          console.log("Child Certificate #" + cId + " - PowerInW: " + c.powerInW)
        }

      } catch(e) {
        console.log("Error transferring certificates\n" + e)
      }


      console.log("-----------------------------------------------------------\n")
      break

    case "SET_ERC20_CERTIFICATE":
      console.log("-----------------------------------------------------------")

      conf.blockchainProperties.activeUser = {
        address: action.data.assetOwner , privateKey: action.data.assetOwnerPK,
      };

      try{
        let certificate = await (new Certificate.Certificate.Entity(action.data.certId, conf).sync());
        await certificate.setOnChainDirectPurchasePrice(action.data.price);
        certificate = await certificate.sync();

        const erc20TestAddress = (await deployERC20TestToken(
            web3,
            action.data.testAccount,
            adminPK,
        )).contractAddress;

        let erc20TestToken = new Erc20TestToken(web3, erc20TestAddress);
        await certificate.setTradableToken(erc20TestAddress);
        certificate = await certificate.sync();
        console.log("Demo ERC token created: " + erc20TestAddress)

        //save in global storage
        contractConfig.ERC20Address = erc20TestAddress
        const writeJsonFile = require('write-json-file')
        await writeJsonFile('contractConfig.json', contractConfig)
      } catch(e) {
        console.log("Error setting ERC20 for certificate trading\n", e)
      }

      console.log("-----------------------------------------------------------\n")

      break
    case "BUY_CERTIFICATE":
      console.log("-----------------------------------------------------------")

      conf.blockchainProperties.activeUser = {
        address: action.data.buyer , privateKey: action.data.buyerPK,
      };

      let erc20TestToken = new Erc20TestToken(web3, contractConfig.ERC20Address)
      await erc20TestToken.approve(action.data.assetOwner, action.data.price, {privateKey: action.data.buyerPK})
      console.log("Allowance: " + await erc20TestToken.allowance(action.data.buyer, action.data.assetOwner))


      try {
        console.log("Buyer Balance(BEFORE):",(await Certificate.TradableEntity.getBalance(action.data.buyer, conf)))
        const certificate = await (new Certificate.Certificate.Entity(action.data.certId, conf).sync());
        await certificate.buyCertificate();
        console.log("Certificate Bought")
        console.log("Buyer Balance(AFTER):",(await Certificate.TradableEntity.getBalance(action.data.buyer, conf)))
      } catch(e) {
        console.log("Error buying Certificates\n" + e)
      }

      console.log("-----------------------------------------------------------\n")
      break

    default:
      const passString = JSON.stringify(action)
      await onboardDemo(passString, adminPK)
  }
}
