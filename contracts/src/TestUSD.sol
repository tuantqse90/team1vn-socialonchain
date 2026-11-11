// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title TestUSD (tUSD)
/// @notice Stablecoin GIẢ LẬP chỉ dùng trên testnet để dựng luồng thanh toán. Không có giá trị thật.
///         Cố ý không dùng tên/ký hiệu của stablecoin thật. Thuộc client, không thuộc lõi protocol.
contract TestUSD is ERC20, ERC20Permit, Ownable {
    error FaucetCooldown(uint256 availableAt);

    uint256 public faucetAmount = 10e6; // 10 tUSD
    uint256 public faucetCooldown = 7 days;
    mapping(address account => uint256) public lastFaucetAt;

    event FaucetConfigured(uint256 amount, uint256 cooldown);

    constructor(address owner_) ERC20("Test USD", "tUSD") ERC20Permit("Test USD") Ownable(owner_) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Owner cấp tUSD (ví dụ cho alpha tester).
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Mỗi địa chỉ nhận `faucetAmount` một lần trong mỗi `faucetCooldown`.
    function faucet() external {
        uint256 last = lastFaucetAt[msg.sender];
        if (last != 0 && block.timestamp < last + faucetCooldown) revert FaucetCooldown(last + faucetCooldown);
        lastFaucetAt[msg.sender] = block.timestamp;
        _mint(msg.sender, faucetAmount);
    }

    function configureFaucet(uint256 amount, uint256 cooldown) external onlyOwner {
        faucetAmount = amount;
        faucetCooldown = cooldown;
        emit FaucetConfigured(amount, cooldown);
    }
}
