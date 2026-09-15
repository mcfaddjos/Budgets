import { useState } from "react";
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { useCategories } from "../data/queries";
import * as repo from "../data/repo";
import { parseCsv, validateRow, TEMPLATE_TEXT } from "../data/csv";

/** Native: read via expo-file-system. Web: DocumentPicker's asset carries a real browser File. */
async function readPickedFileAsText(file) {
  if (file.file && typeof file.file.text === "function") return file.file.text();
  return FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.UTF8 });
}

/**
 * Bulk manual entry from a CSV the user fills out themselves (roadmap
 * task #3) — distinct from bank-statement import (PRD §8.1), which has
 * to handle arbitrary issuer formats; this only ever needs to understand
 * our own fixed template, so it's a much smaller parser (see data/csv.js).
 * Runs entirely client-side, same as every other write path under §10a —
 * parsing, category matching, and encryption all happen here before
 * anything reaches the server.
 */
export default function CsvImportModal({ visible, accountId, onClose, onImported }) {
  const { activeHouseholdId } = useAuth();
  const { data: categories = [] } = useCategories();
  const queryClient = useQueryClient();

  const [rows, setRows] = useState(null); // validated rows, once a file's been picked
  const [fileName, setFileName] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);

  function reset() {
    setRows(null);
    setFileName(null);
    setError(null);
  }

  async function handlePickFile() {
    setError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: ["text/csv", "text/comma-separated-values", "text/plain"],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const file = result.assets?.[0];
    if (!file) return;

    setParsing(true);
    try {
      const text = await readPickedFileAsText(file);
      const { rows: parsedRows } = parseCsv(text);
      if (parsedRows.length === 0) throw new Error("No rows found in that file.");

      const categoryIdByLowerName = {};
      for (const c of categories) categoryIdByLowerName[c.name.toLowerCase()] = c.id;

      setRows(parsedRows.map((row) => validateRow(row, categoryIdByLowerName)));
      setFileName(file.name);
    } catch (err) {
      setError(err.message);
    } finally {
      setParsing(false);
    }
  }

  async function handleConfirmImport() {
    const validRows = rows.filter((r) => r.errors.length === 0);
    setImporting(true);
    let created = 0;
    try {
      for (const row of validRows) {
        await repo.createManualTransaction(activeHouseholdId, {
          accountId,
          categoryId: row.categoryId || null,
          amount: row.amount,
          description: row.description,
          date: row.date,
        });
        created++;
      }
      await queryClient.invalidateQueries();
      Alert.alert("Import complete", `${created} transaction(s) imported.`);
      reset();
      onImported();
    } catch (err) {
      Alert.alert(
        "Import stopped partway",
        `${created} transaction(s) were already created before this failed: ${err.message}`
      );
    } finally {
      setImporting(false);
    }
  }

  function handleClose() {
    reset();
    onClose();
  }

  const validCount = rows ? rows.filter((r) => r.errors.length === 0).length : 0;
  const invalidRows = rows ? rows.filter((r) => r.errors.length > 0) : [];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Import from CSV</Text>

          {!rows ? (
            <>
              <Text style={styles.label}>Expected format (column order doesn't matter):</Text>
              <View style={styles.templateBox}>
                <Text style={styles.templateText} selectable>
                  {TEMPLATE_TEXT}
                </Text>
              </View>
              <Text style={styles.hint}>
                Amount is positive for money spent, negative for a refund/credit. Category must
                match an existing category name exactly (not case-sensitive) — rows with an unknown
                category are skipped, not guessed at.
              </Text>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <TouchableOpacity style={styles.primaryButton} onPress={handlePickFile} disabled={parsing}>
                <Text style={styles.primaryButtonText}>{parsing ? "Reading…" : "Choose CSV File"}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.label}>{fileName}</Text>
              <Text style={styles.summary}>
                {rows.length} row(s) found — {validCount} ready to import
                {invalidRows.length > 0 ? `, ${invalidRows.length} will be skipped` : ""}.
              </Text>

              {invalidRows.length > 0 ? (
                <ScrollView style={styles.errorList}>
                  {invalidRows.slice(0, 10).map((r, i) => (
                    <Text key={i} style={styles.errorRow}>
                      Row {i + 1}: {r.errors.join(", ")}
                    </Text>
                  ))}
                  {invalidRows.length > 10 ? (
                    <Text style={styles.errorRow}>…and {invalidRows.length - 10} more.</Text>
                  ) : null}
                </ScrollView>
              ) : null}

              <TouchableOpacity style={styles.secondaryButton} onPress={reset}>
                <Text style={styles.secondaryButtonText}>Choose a different file</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={styles.formActions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleClose}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
            {rows ? (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleConfirmImport}
                disabled={importing || validCount === 0}
              >
                <Text style={styles.primaryButtonText}>
                  {importing ? "Importing…" : `Import ${validCount}`}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 20, maxHeight: "85%" },
  modalTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  label: { fontSize: 13, fontWeight: "600", color: "#333", marginBottom: 8 },
  templateBox: { backgroundColor: "#f2f2f2", borderRadius: 8, padding: 12, marginBottom: 8 },
  templateText: { fontFamily: "monospace", fontSize: 12 },
  hint: { fontSize: 12, color: "#888", marginBottom: 16, lineHeight: 17 },
  summary: { fontSize: 13, color: "#333", marginBottom: 8 },
  errorList: { maxHeight: 140, marginBottom: 12 },
  errorRow: { fontSize: 12, color: "#c0392b", marginBottom: 4 },
  errorText: { color: "#c0392b", fontSize: 13, marginBottom: 12 },
  formActions: { flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 16 },
  primaryButton: { backgroundColor: "#1a6ed8", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 18 },
  primaryButtonText: { color: "#fff", fontWeight: "600" },
  secondaryButton: { paddingVertical: 10, paddingHorizontal: 18 },
  secondaryButtonText: { color: "#666" },
});
