// Module rỗng (CommonJS nên export là động) thay cho dependency tuỳ chọn không dùng tới:
// x402 trong @coinbase/cdp-sdk, bị kéo vào qua @base-org/account của wagmi connectors.
module.exports = {};
