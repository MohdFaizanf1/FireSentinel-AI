# ============================================
# FireShield-AI Big Data Pipeline using PySpark
# Apache Spark Full Code
# Purpose:
# - Load multiple fire datasets
# - Clean metadata
# - Remove duplicates
# - Create train/valid/test split
# - Generate analytics logs
# ============================================

from pyspark.sql import SparkSession
from pyspark.sql.functions import *
from pyspark.sql.types import *
import os

# ============================================
# 1. Start Spark Session
# ============================================

spark = SparkSession.builder \
    .appName("FireShield-AI Data Pipeline") \
    .master("local[*]") \
    .getOrCreate()

spark.sparkContext.setLogLevel("ERROR")

print("Spark Started Successfully")

# ============================================
# 2. Sample Dataset Metadata
# (Image path + class + source)
# ============================================

data = [
    ("datasets/phylake/fire_001.jpg", "fire", "phylake1337"),
    ("datasets/phylake/fire_002.jpg", "fire", "phylake1337"),
    ("datasets/phylake/nonfire_001.jpg", "non_fire", "phylake1337"),
    ("datasets/ankan/img001.jpg", "fire", "ankan1998"),
    ("datasets/smoke/img001.jpg", "smoke", "sayedgamal99"),
    ("datasets/home/kitchen01.jpg", "fire", "home_fire"),
    ("datasets/home/room01.jpg", "non_fire", "home_fire"),
]

columns = ["image_path", "label", "source"]

df = spark.createDataFrame(data, columns)

print("Original Dataset")
df.show(truncate=False)

# ============================================
# 3. Remove Duplicate Records
# ============================================

df = df.dropDuplicates(["image_path"])

print("After Removing Duplicates")
df.show(truncate=False)

# ============================================
# 4. Add Image Name Column
# ============================================

df = df.withColumn("file_name", regexp_extract(col("image_path"), r'([^/]+$)', 1))

# ============================================
# 5. Encode Labels
# fire = 1
# non_fire = 0
# smoke = 2
# ============================================

df = df.withColumn(
    "class_id",
    when(col("label") == "fire", 1)
    .when(col("label") == "non_fire", 0)
    .when(col("label") == "smoke", 2)
)

# ============================================
# 6. Train / Validation / Test Split
# ============================================

train_df, val_df, test_df = df.randomSplit([0.7, 0.2, 0.1], seed=42)

print("Train Count:", train_df.count())
print("Validation Count:", val_df.count())
print("Test Count:", test_df.count())

# ============================================
# 7. Save Splits as CSV Metadata
# ============================================

train_df.write.mode("overwrite").csv("output/train_metadata", header=True)
val_df.write.mode("overwrite").csv("output/val_metadata", header=True)
test_df.write.mode("overwrite").csv("output/test_metadata", header=True)

print("Metadata Saved")

# ============================================
# 8. Analytics
# ============================================

print("Class Distribution")
df.groupBy("label").count().show()

print("Dataset Source Distribution")
df.groupBy("source").count().show()

# ============================================
# 9. Detection Logs Example
# ============================================

logs = [
    ("2026-04-23 10:00", "Camera_1", "fire", 91.5),
    ("2026-04-23 10:10", "Camera_2", "non_fire", 10.0),
    ("2026-04-23 10:15", "Camera_1", "fire", 88.3),
    ("2026-04-23 10:20", "Camera_3", "smoke", 72.4),
]

log_cols = ["timestamp", "camera_id", "prediction", "confidence"]

log_df = spark.createDataFrame(logs, log_cols)

print("Detection Logs")
log_df.show()

# ============================================
# 10. Fire Alerts per Camera
# ============================================

print("Fire Alerts per Camera")
log_df.filter(col("prediction") == "fire") \
      .groupBy("camera_id") \
      .count() \
      .show()

# ============================================
# 11. Average Confidence
# ============================================

print("Average Confidence")
log_df.groupBy("prediction") \
      .avg("confidence") \
      .show()

# ============================================
# 12. Stop Spark
# ============================================

spark.stop()

print("Spark Session Stopped")