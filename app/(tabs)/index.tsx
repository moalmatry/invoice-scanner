import { CameraView, useCameraPermissions } from "expo-camera";
import { extractTextFromImage } from "expo-text-extractor";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function InvoiceScanner() {
  const [permission, requestPermission] = useCameraPermissions();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [rawText, setRawText] = useState("");
  const cameraRef = useRef<CameraView>(null);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>
          We need your permission to access the camera
        </Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync();
        if (photo?.uri) {
          setImageUri(photo.uri);
          extractInvoiceData(photo.uri);
        }
      } catch (error) {
        console.error("Error taking picture:", error);
        Alert.alert("Error", "Failed to take picture");
      }
    }
  };

  const extractInvoiceData = async (uri: string) => {
    setIsProcessing(true);
    try {
      // Extract text using expo-text-extractor
      const textArray = await extractTextFromImage(uri);
      const text = textArray.join("\n");

      console.log("Extracted text:", text);
      setRawText(text);

      // Parse invoice data
      const parsedData = parseInvoiceData(text);
      setExtractedData(parsedData);
    } catch (error) {
      console.error("OCR Error:", error);
      Alert.alert("Error", "Failed to extract text from image");
    } finally {
      setIsProcessing(false);
    }
  };

  const parseInvoiceData = (text: string) => {
    // Extract invoice number
    const invoiceNumberMatch = text.match(/invoice\s*#?\s*:?\s*(\w+)/i);
    const invoiceNumber = invoiceNumberMatch ? invoiceNumberMatch[1] : "N/A";

    // Extract date (various formats)
    const dateMatch = text.match(
      /date\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i
    );
    const date = dateMatch ? dateMatch[1] : "N/A";

    // Extract total amount (various formats)
    const totalMatch = text.match(/total\s*:?\s*\$?\s*([\d,]+\.?\d{0,2})/i);
    const total = totalMatch ? totalMatch[1] : "N/A";

    // Extract vendor/company name (usually at the top)
    const lines = text.split("\n").filter((line) => line.trim());
    const vendor = lines.length > 0 ? lines[0].trim() : "N/A";

    // Extract items (simplified)
    const items: string[] = [];
    const itemMatches = text.matchAll(/(\w+.*?)\s+\$?([\d,]+\.?\d{0,2})/g);
    for (const match of itemMatches) {
      items.push(`${match[1]}: $${match[2]}`);
    }

    return {
      invoiceNumber,
      date,
      total,
      vendor,
      items: items.length > 0 ? items : ["No items detected"],
    };
  };

  const resetScanner = () => {
    setImageUri(null);
    setExtractedData(null);
    setRawText("");
    setIsProcessing(false);
  };

  return (
    <View style={styles.container}>
      {!imageUri ? (
        <>
          <CameraView style={styles.camera} ref={cameraRef} facing="back" />
          {/* Overlay with absolute positioning - fixes the warning */}
          <View style={styles.overlay}>
            <View style={styles.scanFrame} />
            <Text style={styles.instructionText}>
              Position invoice within the frame
            </Text>
          </View>
          <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
            <View style={styles.captureButtonInner} />
          </TouchableOpacity>
        </>
      ) : (
        <ScrollView style={styles.resultContainer}>
          <Image source={{ uri: imageUri }} style={styles.imagePreview} />

          {isProcessing ? (
            <View style={styles.processingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.processingText}>Processing invoice...</Text>
            </View>
          ) : (
            <>
              {extractedData && (
                <View style={styles.dataContainer}>
                  <Text style={styles.sectionTitle}>Extracted Data</Text>

                  <View style={styles.dataRow}>
                    <Text style={styles.dataLabel}>Invoice Number:</Text>
                    <Text style={styles.dataValue}>
                      {extractedData.invoiceNumber}
                    </Text>
                  </View>

                  <View style={styles.dataRow}>
                    <Text style={styles.dataLabel}>Date:</Text>
                    <Text style={styles.dataValue}>{extractedData.date}</Text>
                  </View>

                  <View style={styles.dataRow}>
                    <Text style={styles.dataLabel}>Vendor:</Text>
                    <Text style={styles.dataValue}>{extractedData.vendor}</Text>
                  </View>

                  <View style={styles.dataRow}>
                    <Text style={styles.dataLabel}>Total:</Text>
                    <Text style={[styles.dataValue, styles.totalAmount]}>
                      ${extractedData.total}
                    </Text>
                  </View>

                  <Text style={styles.sectionTitle}>Items</Text>
                  {extractedData.items.map((item: string, index: number) => (
                    <Text key={index} style={styles.itemText}>
                      • {item}
                    </Text>
                  ))}

                  <Text style={styles.sectionTitle}>Raw Text</Text>
                  <Text style={styles.rawText}>{rawText}</Text>
                </View>
              )}

              <TouchableOpacity style={styles.button} onPress={resetScanner}>
                <Text style={styles.buttonText}>Scan Another Invoice</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
    pointerEvents: "none", // Allow touches to pass through to camera
  },
  scanFrame: {
    width: 300,
    height: 400,
    borderWidth: 2,
    borderColor: "#fff",
    borderRadius: 10,
    backgroundColor: "transparent",
  },
  instructionText: {
    color: "#fff",
    fontSize: 16,
    marginTop: 20,
    textAlign: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    padding: 10,
    borderRadius: 5,
  },
  captureButton: {
    position: "absolute",
    bottom: 40,
    alignSelf: "center",
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#007AFF",
  },
  resultContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  imagePreview: {
    width: "100%",
    height: 300,
    resizeMode: "contain",
    backgroundColor: "#000",
  },
  processingContainer: {
    padding: 40,
    alignItems: "center",
  },
  processingText: {
    marginTop: 20,
    fontSize: 16,
    color: "#666",
  },
  dataContainer: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 20,
    marginBottom: 10,
    color: "#333",
  },
  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  dataLabel: {
    fontSize: 16,
    color: "#666",
    fontWeight: "600",
  },
  dataValue: {
    fontSize: 16,
    color: "#333",
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#007AFF",
  },
  itemText: {
    fontSize: 14,
    color: "#333",
    paddingVertical: 4,
  },
  rawText: {
    fontSize: 12,
    color: "#666",
    backgroundColor: "#f5f5f5",
    padding: 10,
    borderRadius: 5,
  },
  button: {
    backgroundColor: "#007AFF",
    padding: 15,
    borderRadius: 10,
    margin: 20,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  message: {
    textAlign: "center",
    paddingBottom: 20,
    fontSize: 16,
    color: "#fff",
    padding: 20,
  },
});
