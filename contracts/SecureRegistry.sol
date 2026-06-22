// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SecureRegistry {
    struct Record {
        string cid;
        address owner;
        uint256 timestamp;
    }

    mapping(bytes32 => Record) private records;
    mapping(address => bytes32[]) private ownerFiles;

    event Registered(
        bytes32 indexed fileHash,
        string cid,
        address indexed owner,
        uint256 timestamp
    );

    function register(bytes32 fileHash, string memory cid) external {
        require(bytes(cid).length > 0, "CID vazio");
        require(records[fileHash].owner == address(0), "Arquivo ja registrado");

        records[fileHash] = Record({
            cid: cid,
            owner: msg.sender,
            timestamp: block.timestamp
        });

        ownerFiles[msg.sender].push(fileHash);

        emit Registered(fileHash, cid, msg.sender, block.timestamp);
    }

    function verify(bytes32 fileHash) external view returns (bool) {
        return records[fileHash].owner != address(0);
    }

    function getRecord(
        bytes32 fileHash
    )
        external
        view
        returns (string memory cid, address owner, uint256 timestamp)
    {
        Record memory r = records[fileHash];
        require(r.owner != address(0), "Registro nao encontrado");

        return (r.cid, r.owner, r.timestamp);
    }

    function getMyFiles() external view returns (bytes32[] memory) {
        return ownerFiles[msg.sender];
    }

    function getFilesByOwner(
        address owner
    ) external view returns (bytes32[] memory) {
        return ownerFiles[owner];
    }
}
