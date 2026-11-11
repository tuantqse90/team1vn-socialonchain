// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IdentityRegistry} from "./IdentityRegistry.sol";

/// @title SocialGraph
/// @notice Graph follow nằm onchain, app nào cũng đọc được. Chỉ lưu `isFollowing`; số đếm do indexer tính.
///         Cho phép follow cả địa chỉ chưa đăng ký (importer dựng graph trước, người kia vào app là có sẵn follower).
contract SocialGraph {
    error NotAuthorized();
    error InvalidTarget();
    error BatchTooLarge();

    uint256 public constant MAX_BATCH = 50;

    IdentityRegistry public immutable identity;

    mapping(address follower => mapping(address target => bool)) public isFollowing;

    event Followed(address indexed follower, address indexed target);
    event Unfollowed(address indexed follower, address indexed target);

    constructor(IdentityRegistry identity_) {
        identity = identity_;
    }

    modifier onlyAuthorized(address actor) {
        if (!identity.isAuthorized(actor, msg.sender)) revert NotAuthorized();
        _;
    }

    /// @notice Follow `target` thay mặt `actor`. Idempotent: đã follow thì không làm gì.
    function follow(address actor, address target) external onlyAuthorized(actor) {
        _follow(actor, target);
    }

    /// @notice Bỏ follow. Idempotent.
    function unfollow(address actor, address target) external onlyAuthorized(actor) {
        if (isFollowing[actor][target]) {
            isFollowing[actor][target] = false;
            emit Unfollowed(actor, target);
        }
    }

    /// @notice Follow nhiều địa chỉ (dùng cho importer), tối đa MAX_BATCH mỗi tx.
    function followMany(address actor, address[] calldata targets) external onlyAuthorized(actor) {
        if (targets.length > MAX_BATCH) revert BatchTooLarge();
        for (uint256 i; i < targets.length; ++i) {
            _follow(actor, targets[i]);
        }
    }

    function _follow(address actor, address target) internal {
        if (target == address(0) || target == actor) revert InvalidTarget();
        if (!isFollowing[actor][target]) {
            isFollowing[actor][target] = true;
            emit Followed(actor, target);
        }
    }
}
