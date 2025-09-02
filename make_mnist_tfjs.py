# make_mnist_tfjs.py
import tensorflow as tf, tensorflowjs as tfjs, os

model = tf.keras.Sequential([
    tf.keras.layers.Input(shape=(28, 28, 1)),   # explicit input
    tf.keras.layers.Conv2D(32, 3, activation="relu"),
    tf.keras.layers.MaxPooling2D(),
    tf.keras.layers.Conv2D(64, 3, activation="relu"),
    tf.keras.layers.MaxPooling2D(),
    tf.keras.layers.Flatten(),
    tf.keras.layers.Dense(128, activation="relu"),
    tf.keras.layers.Dense(10, activation="softmax"),
])

model.compile(optimizer="adam",
              loss="sparse_categorical_crossentropy",
              metrics=["accuracy"])

(xtr, ytr), _ = tf.keras.datasets.mnist.load_data()
xtr = (xtr[..., None]/255.).astype("float32")
model.fit(xtr, ytr, epochs=1, batch_size=128, verbose=1)

out_dir = "./mnist_model"
os.makedirs(out_dir, exist_ok=True)
tfjs.converters.save_keras_model(model, out_dir)
print("✅ Exported TF.js model to", out_dir)
