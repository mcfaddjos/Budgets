import { useCallback, useEffect, useState } from "react";
import { Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { api } from "../api/client";

export default function DebugLogsModal({ visible, onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLogs(await api.debugLogs());
    } catch (err) {
      Alert.alert("Couldn't load logs", err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.header}>
            <Text style={styles.title}>Recent errors</Text>
            <TouchableOpacity onPress={load} disabled={loading}>
              <Text style={styles.refresh}>{loading ? "Loading…" : "Refresh"}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.list}>
            {logs.length === 0 && !loading ? (
              <Text style={styles.empty}>No errors logged recently.</Text>
            ) : null}
            {logs.map((log, i) => (
              <View key={i} style={styles.entry}>
                <Text style={styles.entryMeta}>
                  {log.timestamp} · {log.platform}
                  {log.context ? ` · ${log.context}` : ""}
                </Text>
                <Text style={styles.entryMessage}>{log.message}</Text>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 16, maxHeight: "85%" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  title: { fontSize: 16, fontWeight: "700" },
  refresh: { color: "#1a6ed8", fontWeight: "600", fontSize: 13 },
  list: { maxHeight: 420 },
  empty: { color: "#888", textAlign: "center", marginVertical: 24 },
  entry: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#eee" },
  entryMeta: { fontSize: 11, color: "#999", marginBottom: 3 },
  entryMessage: { fontSize: 12, color: "#333", fontFamily: "monospace" },
  closeButton: { marginTop: 12, alignItems: "center", paddingVertical: 10 },
  closeButtonText: { color: "#666", fontWeight: "600" },
});
