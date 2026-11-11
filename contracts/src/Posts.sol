// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IdentityRegistry} from "./IdentityRegistry.sol";

/// @title Posts
/// @notice Bài viết nằm trong event (text không lưu vào storage). Storage chỉ có `authorOf` để kiểm quyền xoá,
///         kiểm bài tồn tại khi react/reply, và để contract khác xác minh tác giả.
contract Posts {
    error NotAuthorized();
    error EmptyText();
    error TextTooLong();
    error MetaTooLong();
    error UnknownPost();
    error NotAuthor();
    error InvalidKind();

    uint256 public constant MAX_TEXT_BYTES = 1024;
    uint256 public constant MAX_META_BYTES = 1024;
    uint8 public constant KIND_LIKE = 1;
    uint8 public constant KIND_REPOST = 2;

    IdentityRegistry public immutable identity;

    mapping(bytes32 id => address) public authorOf;
    mapping(address author => uint256) public postNonce;

    event Posted(
        bytes32 id,
        address indexed author,
        bytes32 indexed parentId,
        bytes32 indexed channel,
        string text,
        bytes meta,
        uint64 timestamp
    );
    event Reacted(address indexed actor, bytes32 indexed postId, uint8 kind);
    event Unreacted(address indexed actor, bytes32 indexed postId, uint8 kind);
    event Deleted(address indexed author, bytes32 indexed id);

    constructor(IdentityRegistry identity_) {
        identity = identity_;
    }

    modifier onlyAuthorized(address actor) {
        if (!identity.isAuthorized(actor, msg.sender)) revert NotAuthorized();
        _;
    }

    /// @param parentId 0 nếu là bài gốc; nếu khác 0 thì phải là một bài onchain đã tồn tại.
    /// @param channel keccak256(tên kênh) hoặc 0.
    /// @param meta JSON nhỏ (lang, mentions, embeds…) để mở rộng mà không cần redeploy.
    function post(address actor, string calldata text, bytes32 parentId, bytes32 channel, bytes calldata meta)
        external
        onlyAuthorized(actor)
        returns (bytes32 id)
    {
        uint256 len = bytes(text).length;
        if (len == 0) revert EmptyText();
        if (len > MAX_TEXT_BYTES) revert TextTooLong();
        if (meta.length > MAX_META_BYTES) revert MetaTooLong();
        if (parentId != bytes32(0) && authorOf[parentId] == address(0)) revert UnknownPost();

        id = keccak256(abi.encode(actor, postNonce[actor]++));
        authorOf[id] = actor;
        emit Posted(id, actor, parentId, channel, text, meta, uint64(block.timestamp));
    }

    function react(address actor, bytes32 postId, uint8 kind) external onlyAuthorized(actor) {
        _checkReaction(postId, kind);
        emit Reacted(actor, postId, kind);
    }

    function unreact(address actor, bytes32 postId, uint8 kind) external onlyAuthorized(actor) {
        _checkReaction(postId, kind);
        emit Unreacted(actor, postId, kind);
    }

    /// @notice Xoá = tombstone. Dữ liệu vẫn nằm trong lịch sử chain; client tôn trọng tombstone.
    function deletePost(address actor, bytes32 id) external onlyAuthorized(actor) {
        if (authorOf[id] != actor) revert NotAuthor();
        emit Deleted(actor, id);
    }

    function _checkReaction(bytes32 postId, uint8 kind) internal view {
        if (kind != KIND_LIKE && kind != KIND_REPOST) revert InvalidKind();
        if (authorOf[postId] == address(0)) revert UnknownPost();
    }
}
