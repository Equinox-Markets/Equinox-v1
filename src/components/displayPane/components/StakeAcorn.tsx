import { FC, useState, useEffect } from 'react';

import { useWeb3React } from '@web3-react/core';
import { Button, Card, Divider, Input, Modal, Tooltip } from 'antd';
import { ethers } from 'ethers';
import { useVault } from 'hooks';
import { useDecimals } from 'hooks';
import  useApproval from 'hooks/useApproval';
import { useMediaQuery } from 'react-responsive';

type AcornStakeProps = {
  vault: {
    name: string;
    address: string;
    abi: any[]
    chainId: number;
    logo: string;
    description: string;
    networkName: string;
    networkLogo: string;
    apr: number;
    strategy: string | JSX.Element;
    depositTokenAddress: string;
    depositTokenAbi: any[]
    textAboveTitle: string | JSX.Element;
    textBelowDescription: string;
    depositTokenName: string;
    TokenName: string;

  };
};

const AcornStake: FC<AcornStakeProps> = ({ vault }) => {
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [depositSuccessMessage, setDepositSuccessMessage] = useState<string | null>(null);
  const [withdrawSuccessMessage, setWithdrawSuccessMessage] = useState<string | null>(null);
  const { account: accountFromWeb3, provider: providerFromWeb3 } = useWeb3React();
  const [pendingRewards, setPendingRewards] = useState('0');
  const provider = providerFromWeb3 || null;
  const account = accountFromWeb3 || null;
  const { vaultTokenBalance, updateVaultTokenBalance } = useVault(vault.address, vault.abi);
  const isMobile = useMediaQuery({ query: '(max-width: 760px)' });
  const [userBalance, setUserBalance] = useState('0');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const decimals = useDecimals(vault.address, vault.abi);
  const { hasApproval, markApprovalDone } = useApproval({
    provider,
    account,
    vault: {
      address: vault.address,
      depositTokenAddress: vault.depositTokenAddress,
      depositTokenAbi: vault.depositTokenAbi
    },
    depositAmount,
  });
  const vaultBalanceFormatted = vaultTokenBalance.isZero()
  ? "0.0"
  : ethers.utils.formatUnits(vaultTokenBalance, decimals);


  if (!provider || !account) return null;

  const signer = provider.getSigner(account);

  useEffect(() => {
    if (account && vault.depositTokenAddress && signer) {
      const tokenContract = new ethers.Contract(vault.depositTokenAddress, vault.depositTokenAbi, signer);
      Promise.all([
        tokenContract.balanceOf(account),
        tokenContract.decimals()
      ])
        .then(([balance, decimals]: [ethers.BigNumber, number]) => {
          const formattedBalance = ethers.utils.formatUnits(balance, decimals);
          setUserBalance(formattedBalance);
        })
        .catch((error: Error) => console.error("Failed to fetch user's token balance and decimals:", error));
    }
  }, [account, vault.depositTokenAddress, signer, vault.depositTokenAbi, vaultTokenBalance]);



  const contract = new ethers.Contract(vault.address, vault.abi, signer);

  useEffect(() => {
    const fetchPendingRewards = async () => {
      try {
        // 'rewards' is a public mapping so it's callable like a function
        const rewards = await contract.rewards(account);
        setPendingRewards(rewards);
      } catch (error) {
        console.error("Failed to fetch pending rewards:", error);
      }
    };

    // Only fetch if account and contract are available
    if (account && contract) {
      fetchPendingRewards();
    }
  }, [account, contract]);

  const deposit = async () => {
    setDepositSuccessMessage(null);
    try {
      const weiAmount = ethers.utils.parseUnits(depositAmount, decimals);
      const depositTokenContract = new ethers.Contract(vault.depositTokenAddress, vault.depositTokenAbi, signer);
      const userBalanceWei = ethers.utils.parseUnits(userBalance, decimals);
      if (weiAmount.isZero()) {
        setErrorMessage("The deposit amount cannot be zero.");
        return;
      }
      if (weiAmount.gt(userBalanceWei)) {
        setErrorMessage("Insufficient balance to complete this deposit.");
        return;
      }

      if (!hasApproval) {
        console.log('Approving...');
        const maxApprovalAmount = ethers.constants.MaxUint256;
        const approveResponse = await depositTokenContract.approve(vault.address, maxApprovalAmount);
        const approveReceipt = await approveResponse.wait();
        console.log('Approve Receipt:', approveReceipt);
        markApprovalDone();

      }

      console.log('Depositing...');
      const transactionResponse = await contract.deposit(weiAmount);
      const transactionResult = await transactionResponse.wait();
      console.log('Deposit Transaction Result:', transactionResult);
      setDepositSuccessMessage('Deposit was successful!');
      refreshBalances();

    } catch (error) {
      console.error('Deposit failed', error);
      setErrorMessage(`The deposit transaction failed with the following error: ${(error as Error).message}`);
    }
  };

  const handleWithdraw = async () => {
    setWithdrawSuccessMessage(null);
    try {
      const weiAmount = ethers.utils.parseUnits(withdrawAmount, decimals);
      if (weiAmount.isZero()) {
        setErrorMessage("The withdraw amount cannot be zero.");
        return;
      }
      const vaultBalanceFormattedWei = ethers.utils.parseUnits(vaultBalanceFormatted, decimals);
      if (weiAmount.gt(vaultBalanceFormattedWei)) {
        setErrorMessage("Insufficient balance to complete this withdrawal.");
        return;
      }
      const transactionResponse = await contract.withdraw(weiAmount);
      const transactionResult = await transactionResponse.wait();
      console.log(transactionResult);
      setWithdrawSuccessMessage('Withdrawal was successful!');
      refreshBalances();

    } catch (error) {
      console.error('Withdraw failed', error);
      setErrorMessage(`The withdraw transaction failed with the following error: ${(error as Error).message}`);
    }
  };

  const claimRewards = async () => {
    try {
      console.log('Claiming rewards...');
      const transactionResponse = await contract.claimRewards();
      const transactionResult = await transactionResponse.wait();
      console.log('Claim Rewards Transaction Result:', transactionResult);
    } catch (error) {
      console.error('Claiming rewards failed', error);
    }
  };



  const refreshBalances = async () => {
    // Fetch decimals for deposit token
    const tokenContract = new ethers.Contract(vault.depositTokenAddress, vault.depositTokenAbi, provider);
    const depositTokenDecimals = await tokenContract.decimals();

    // Fetch user balance for deposit token
    const balance = await tokenContract.balanceOf(account);

    // Format user balance using fetched decimals for deposit token
    const formattedBalance = ethers.utils.formatUnits(balance, depositTokenDecimals);

    // Update user balance state
    setUserBalance(formattedBalance);

    // Fetch vault contract
    const vaultContract = new ethers.Contract(vault.address, vault.abi, provider);

    // Fetch decimals for vault
    const vaultDecimals = await vaultContract.decimals();

    // Fetch and format vault balance
    const vaultBalance = await vaultContract.balanceOf(account);
    const formattedVaultBalance = ethers.utils.formatUnits(vaultBalance, vaultDecimals);

    // Update vault balance state
    updateVaultTokenBalance(formattedVaultBalance);
  };


  const handleModalOpen = () => {
    setIsModalVisible(true);
  };

  const handleModalClose = (e: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setIsModalVisible(false);
  };

  //const handleCardClick = () => {
  //  setShowActions(!showActions);
  //};


  return (
  <div
    //onClick={handleCardClick}
    style={{
      width: "100%",
      marginBottom: "30px",
      marginTop: "15px",
      display: 'flex',
      justifyContent: 'center',
      transition: 'transform .2s, border-color .2s',
    }}
  >
    {depositSuccessMessage && (
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: "#000509" }}>
            {"Transaction Successful"}
          </div>
        }
        visible={!!depositSuccessMessage}
        onCancel={() => {
          setDepositSuccessMessage(null);
          //handleCardClick();
        }}
        footer={null}
        centered
        bodyStyle={{ backgroundColor: "transparent", color: "white" }}
        wrapClassName="custom-modal responsive-modal"
      >
        <Card
          style={{
            backgroundColor: "#000509",
            color: "white",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            alignItems: "center",
            width: "auto",
            minHeight: "10vh",
            marginTop: "20px",
            border: "transparent"
          }}
        >
          <p style={{ fontSize: "20px" }}>{depositSuccessMessage}</p>
        </Card>
      </Modal>
    )}
    {withdrawSuccessMessage && (
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: "#000509" }}>
            {"Transaction Successful"}
          </div>
        }
        visible={!!withdrawSuccessMessage}
        onCancel={() => {
          setWithdrawSuccessMessage(null);
          //handleCardClick();
        }}
        footer={null}
        centered
        bodyStyle={{ backgroundColor: "transparent", color: "white" }}
        wrapClassName="custom-modal responsive-modal"
      >
        <Card
          style={{
            backgroundColor: "#000509",
            color: "white",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            alignItems: "center",
            width: "auto",
            minHeight: "10vh",
            marginTop: "20px",
            border: "transparent"
          }}
        >
          <p style={{ fontSize: "20px" }}>{withdrawSuccessMessage}</p>
        </Card>
      </Modal>
    )}
    {errorMessage && (
      <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', backgroundColor: "#000509" }}>
          {"Transaction failed"}
        </div>
      }
        visible={errorMessage ? true : false}
        onCancel={() => {
          setErrorMessage(null);
          //handleCardClick();
        }}
        footer={null}
        centered
        bodyStyle={{ backgroundColor: "transparent", color: "white" }}
        wrapClassName="custom-modal responsive-modal"
      >
        <Card
          style={{
            backgroundColor: "#000509",
            color: "white",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            alignItems: "center",
            width: "auto",
            minHeight: "10vh",
            marginTop: "20px",
            border: "transparent"
          }}
        >
          <p style={{ fontSize: "20px" }}>{errorMessage}</p>
        </Card>
      </Modal>
    )}
    <Card
      style={{
      background: 'linear-gradient(360deg, #030303, #022B45)',
      color: 'white',
      borderRadius: '12px',
      border: '1px solid #050505',
      transition: 'border-color .2s',
      maxWidth: "100%",
      width: '100%',
      }}
      >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
      <img src={vault.logo} alt={`${vault.name} Logo`} width={isMobile ? '35px' : '65px'} />
      <h2 className="smaller-h2" style={{ textAlign: 'left', marginLeft: '15px' }}>
        ETH Rewards: {pendingRewards === '0' ? "0.0" : parseFloat(ethers.utils.formatUnits(pendingRewards, decimals)).toFixed(4)}
      </h2>

      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
      <Button
        onClick={(e) => {
          e.stopPropagation();
          claimRewards();
        }}
        style={{
          color: 'white',
          backgroundColor: '#064576',
          border: '1px solid #011F37',
          borderRadius: '12px',
          marginRight: '10px',
          marginLeft: '5px',
        }}
      >
        Claim
      </Button>
        <Button
          onClick={(e) => {
            e.stopPropagation();
            handleModalOpen();
          }}
          style={{
            color: 'white',
            backgroundColor: '#064576',
            border: '1px solid #011F37',
            borderRadius: '12px',
          }}
        >
          Stake Info
        </Button>
      </div>
      </div>
      <Divider style={{ borderColor: '#064576', borderWidth: '1.5px', marginTop: '20px', marginBottom: '20px' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
        <h3 className="smaller-h2">Your Balance: {vaultTokenBalance.isZero() ? "0.0" : parseFloat(ethers.utils.formatUnits(vaultTokenBalance, decimals)).toFixed(2)}</h3>
      </div>
      <div>
      <Tooltip title={<div>Yield APR: 10.7%<br/>Fees APR: 2.7%</div>}>
        <h3 className="smaller-h2" style={{ textDecoration: 'underline' }}>APR: {vault.apr}%</h3>
      </Tooltip>
      </div>
      </div>
      <Divider style={{ borderColor: '#064576', borderWidth: '1.5px', marginTop: '20px', marginBottom: '20px' }} />
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

    {/* Deposit Section */}
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '48%' }}>
      
      <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
        <Input
          placeholder={`${vault.depositTokenName}: ${userBalance}`}
          value={depositAmount}
          onChange={(e) => setDepositAmount(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            color: 'white',
            backgroundColor: '#011F37',
            borderColor: '#011F37',
            width: '80%',
          }}
        />
        <Button
          className="max-button-deposit"
          onClick={(e) => {
            e.stopPropagation();
            setDepositAmount(userBalance);
          }}
          style={{
            color: '#D9D9D9',
            backgroundColor: '#011F37',
            border: '1px solid #011F37',
            borderRadius: '12px',
            marginLeft: '10px',
          }}
        >
          MAX
        </Button>
      </div>
      
      <Button
        onClick={(e) => {
          e.stopPropagation();
          deposit();
        }}
        style={{
          color: 'white',
          backgroundColor: '#064576',
          border: '1px solid #011F37',
          borderRadius: '12px',
          marginTop: '10px',
          width: '100%',
        }}
      >
        Stake
      </Button>
      
    </div>

    {/* Withdraw Section */}
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '48%' }}>
      
      <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
        <Input
          placeholder={`${vault.TokenName} ${vaultBalanceFormatted}`}
          value={withdrawAmount}
          onChange={(e) => setWithdrawAmount(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            color: 'white',
            backgroundColor: '#011F37',
            borderColor: '#011F37',
            width: '80%',
          }}
        />
        <Button
          className="max-button-withdraw"
          onClick={(e) => {
            e.stopPropagation();
            setWithdrawAmount(ethers.utils.formatUnits(vaultTokenBalance, decimals));
          }}
          style={{
            color: '#D9D9D9',
            backgroundColor: '#011F37',
            border: '1px solid #011F37',
            borderRadius: '12px',
            marginLeft: '10px',
          }}
        >
          MAX
        </Button>
      </div>
      
      <Button
        onClick={(e) => {
          e.stopPropagation();
          handleWithdraw();
        }}
        style={{
          color: 'white',
          backgroundColor: '#064576',
          border: '1px solid #011F37',
          borderRadius: '12px',
          marginTop: '10px',
          width: '100%',
        }}
      >
        Unstake
      </Button>
      </div>
      </div>
    
  </Card>

    {isModalVisible && (
      <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', backgroundColor: "#000509", }}>
          <img src={vault.logo} alt={`${vault.name} Logo`} style={{ width: '24px', marginRight: '10px' }} />
          {vault.name}
        </div>
      }
      visible={isModalVisible}
      onCancel={(e) => handleModalClose(e)}
      footer={null}
      centered
      bodyStyle={{ backgroundColor: "transparent", color: "transparent" }}
      wrapClassName="custom-modal responsive-modal"
    >
        <Card
          style={{
            backgroundColor: "#000509",  // Change this line
            color: "white",  // Change this line
            border: "0px solid #064576",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            alignItems: "center",
            width: "auto",
            minHeight: "10vh",
            marginTop: "20px",
          }}
        >
          <p style={{ fontSize: "15px" }}>{vault.textAboveTitle}</p>
          <Divider style={{ borderColor: '#064576', borderWidth: '2px', marginTop: '20px', marginBottom: '20px' }} />
          <h2 style={{ fontSize: "17px" }}>How it Works</h2>
          <p style={{ fontSize: "17px" }}>{vault.strategy}</p>
          <Divider style={{ borderColor: '#064576', borderWidth: '2px', marginTop: '20px', marginBottom: '20px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: "15px" }}>
            <p>{vault.textBelowDescription}</p>
          </div>
        </Card>
      </Modal>
    )}
  </div>
  );
};

export default AcornStake;