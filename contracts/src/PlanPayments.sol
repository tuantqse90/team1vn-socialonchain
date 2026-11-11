// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title PlanPayments
/// @notice Thanh toán gói (Pro…) của CLIENT, không thuộc lõi protocol. Token là immutable: khi chuyển sang tiền
///         thật thì deploy lại với địa chỉ USDC. Backend chỉ đọc event `Paid` để mở quota.
contract PlanPayments is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error UnknownPlan();
    error InvalidMonths();
    error InvalidTreasury();

    uint8 public constant MAX_MONTHS = 12;
    uint64 public constant MONTH = 30 days;

    IERC20 public immutable token;
    address public treasury;

    mapping(uint8 planId => uint256) public pricePerMonth;
    mapping(address user => mapping(uint8 planId => uint64)) public paidUntil;

    event PlanSet(uint8 indexed planId, uint256 pricePerMonth);
    event TreasurySet(address indexed treasury);
    event Paid(address indexed user, uint8 indexed planId, uint256 amount, uint64 paidUntil);

    constructor(IERC20 token_, address treasury_, address owner_) Ownable(owner_) {
        if (treasury_ == address(0)) revert InvalidTreasury();
        token = token_;
        treasury = treasury_;
    }

    function setPlan(uint8 planId, uint256 price) external onlyOwner {
        pricePerMonth[planId] = price;
        emit PlanSet(planId, price);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert InvalidTreasury();
        treasury = treasury_;
        emit TreasurySet(treasury_);
    }

    function pay(uint8 planId, uint8 months) external nonReentrant {
        _pay(planId, months);
    }

    /// @notice Ký permit (không tốn gas) rồi trả trong 1 tx. Permit lỗi (ví dụ đã bị dùng trước) thì vẫn thử trả
    ///         bằng allowance hiện có, để không bị chặn bởi front-running permit.
    function payWithPermit(uint8 planId, uint8 months, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
        nonReentrant
    {
        uint256 amount = _quote(planId, months);
        try IERC20Permit(address(token)).permit(msg.sender, address(this), amount, deadline, v, r, s) {} catch {}
        _pay(planId, months);
    }

    function quote(uint8 planId, uint8 months) external view returns (uint256) {
        return _quote(planId, months);
    }

    function _quote(uint8 planId, uint8 months) internal view returns (uint256) {
        uint256 price = pricePerMonth[planId];
        if (price == 0) revert UnknownPlan();
        if (months == 0 || months > MAX_MONTHS) revert InvalidMonths();
        return price * months;
    }

    function _pay(uint8 planId, uint8 months) internal {
        uint256 amount = _quote(planId, months);
        uint64 start = paidUntil[msg.sender][planId];
        if (start < block.timestamp) start = uint64(block.timestamp);
        uint64 until = start + uint64(months) * MONTH;
        paidUntil[msg.sender][planId] = until;
        token.safeTransferFrom(msg.sender, treasury, amount);
        emit Paid(msg.sender, planId, amount, until);
    }
}
