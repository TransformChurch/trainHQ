import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDriveFolderId } from "./wikiDriveSync";

test("normalizes Drive folder IDs and common folder links", () => {
  assert.equal(normalizeDriveFolderId("folder_123456789"), "folder_123456789");
  assert.equal(
    normalizeDriveFolderId("https://drive.google.com/drive/folders/folder_123456789?usp=sharing"),
    "folder_123456789",
  );
  assert.equal(normalizeDriveFolderId("root"), null);
  assert.equal(normalizeDriveFolderId("root", true), "root");
  assert.equal(normalizeDriveFolderId("https://example.com/folders/folder_123456789"), null);
});