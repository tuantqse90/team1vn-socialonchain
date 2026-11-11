// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IdentityRegistry
/// @notice Danh tính = địa chỉ ví. Contract này chỉ lưu handle (tùy chọn), profileURI và session key (delegate).
///         Không có admin, không thu phí, không upgrade.
/// @dev Delegate (session key) do owner cấp. Delegate KHÔNG thể quản lý delegate hay đăng ký handle cho owner:
///      các hàm đó không nhận tham số `actor`, nên luôn tác động lên chính `msg.sender`.
contract IdentityRegistry {
    error InvalidHandle();
    error HandleTaken();
    error AlreadyRegistered();
    error NotAuthorized();
    error InvalidDelegate();
    error InvalidExpiry();
    error UriTooLong();
    error TransferFailed();

    uint256 public constant MAX_URI_BYTES = 512;
    uint64 public constant MAX_DELEGATE_DURATION = 365 days;

    /// @notice owner đã đăng ký hay chưa (đăng ký là tùy chọn; địa chỉ chưa đăng ký vẫn đăng bài/follow được).
    mapping(address owner => bool) public registered;
    /// @notice handle của owner ("" nếu không có).
    mapping(address owner => string) public handleOf;
    /// @notice owner của một handle (key = keccak256(handle)).
    mapping(bytes32 handleHash => address) public ownerOfHandle;
    /// @notice thời điểm hết hạn của delegate; 0 = không phải delegate.
    mapping(address owner => mapping(address key => uint64)) public delegateExpiry;

    event Registered(address indexed owner, string handle, string profileURI);
    event ProfileUpdated(address indexed owner, string profileURI);
    event DelegateAdded(address indexed owner, address indexed key, uint64 expiresAt);
    event DelegateRemoved(address indexed owner, address indexed key);

    /// @notice Đăng ký identity (handle có thể rỗng).
    function register(string calldata handle, string calldata profileURI) external {
        _register(msg.sender, handle, profileURI);
    }

    /// @notice Onboarding trong 1 tx: đăng ký + cấp session key + chuyển msg.value sang session key để nó tự trả gas.
    function registerWithDelegate(string calldata handle, string calldata profileURI, address key, uint64 expiresAt)
        external
        payable
    {
        _register(msg.sender, handle, profileURI);
        _addDelegate(msg.sender, key, expiresAt);
        _forward(key);
    }

    /// @notice Cập nhật profile. Owner hoặc delegate còn hạn của `actor` được gọi.
    function setProfile(address actor, string calldata profileURI) external {
        if (!isAuthorized(actor, msg.sender)) revert NotAuthorized();
        if (bytes(profileURI).length > MAX_URI_BYTES) revert UriTooLong();
        emit ProfileUpdated(actor, profileURI);
    }

    /// @notice Cấp hoặc gia hạn session key; msg.value (nếu có) được chuyển sang key để nạp gas.
    function addDelegate(address key, uint64 expiresAt) external payable {
        _addDelegate(msg.sender, key, expiresAt);
        _forward(key);
    }

    /// @notice Thu hồi session key.
    function removeDelegate(address key) external {
        if (delegateExpiry[msg.sender][key] == 0) revert InvalidDelegate();
        delete delegateExpiry[msg.sender][key];
        emit DelegateRemoved(msg.sender, key);
    }

    /// @notice `signer` có được hành động thay `owner` không (chính owner, hoặc delegate còn hạn).
    function isAuthorized(address owner, address signer) public view returns (bool) {
        return signer == owner || delegateExpiry[owner][signer] > block.timestamp;
    }

    /// @notice Kiểm tra handle hợp lệ: rỗng, hoặc 3–20 ký tự [a-z0-9_].
    function isValidHandle(string calldata handle) public pure returns (bool) {
        bytes memory b = bytes(handle);
        if (b.length == 0) return true;
        if (b.length < 3 || b.length > 20) return false;
        for (uint256 i; i < b.length; ++i) {
            bytes1 c = b[i];
            bool ok = (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || c == 0x5f;
            if (!ok) return false;
        }
        return true;
    }

    function _register(address owner, string calldata handle, string calldata profileURI) internal {
        if (registered[owner]) revert AlreadyRegistered();
        if (!isValidHandle(handle)) revert InvalidHandle();
        if (bytes(profileURI).length > MAX_URI_BYTES) revert UriTooLong();
        if (bytes(handle).length > 0) {
            bytes32 h = keccak256(bytes(handle));
            if (ownerOfHandle[h] != address(0)) revert HandleTaken();
            ownerOfHandle[h] = owner;
            handleOf[owner] = handle;
        }
        registered[owner] = true;
        emit Registered(owner, handle, profileURI);
    }

    function _addDelegate(address owner, address key, uint64 expiresAt) internal {
        if (key == address(0) || key == owner) revert InvalidDelegate();
        if (expiresAt <= block.timestamp || expiresAt > block.timestamp + MAX_DELEGATE_DURATION) {
            revert InvalidExpiry();
        }
        delegateExpiry[owner][key] = expiresAt;
        emit DelegateAdded(owner, key, expiresAt);
    }

    function _forward(address to) internal {
        if (msg.value == 0) return;
        (bool ok,) = payable(to).call{value: msg.value}("");
        if (!ok) revert TransferFailed();
    }
}
