import { FC } from "react";

import { Button } from "antd";

import { theme } from "styles/theme";

const styles = {
  connectButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
    paddingBlock: "20px",
    marginBottom: "12px",
    background: theme.colors.white,
    boxShadow: "0 4px 4px rgba(0,0,0,.25),0 0 5px rgba(0,0,0,.25),inset 0 0 10px #fff",
    border: "none", // Here's the border color change
    borderRadius: "10px"
  },
  connectButtonText: {
    fontWeight: "600",
    paddingLeft: "30px"
  }
} as const;

interface ConnectButtonProps {
  label: string;
  image: string;
  onClick: () => void;
  loading: boolean;
}

const ConnectButton: FC<ConnectButtonProps> = ({ label, image, onClick, loading }) => {
  return (
    <Button style={styles.connectButton} key={label} onClick={onClick} loading={loading}>
      <span style={styles.connectButtonText}>{label}</span>
      <img src={image} width={32} height={32} alt="web3-wallet" />
    </Button>
  );
};

export default ConnectButton;

