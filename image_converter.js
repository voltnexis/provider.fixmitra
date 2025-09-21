// Image Converter Utility for WebP Conversion and Upload
class ImageConverter {
    constructor(supabaseClient) {
        this.supabase = supabaseClient;
        this.bucketName = 'provider-images';
    }

    // Convert image to WebP format
    async convertToWebP(file, quality = 0.8) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = () => {
                // Calculate new dimensions (max 1200px width/height)
                let { width, height } = this.calculateDimensions(img.width, img.height);
                
                canvas.width = width;
                canvas.height = height;
                
                // Draw and convert to WebP
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob(resolve, 'image/webp', quality);
            };
            
            img.src = URL.createObjectURL(file);
        });
    }

    // Calculate optimal dimensions
    calculateDimensions(width, height, maxSize = 1200) {
        if (width <= maxSize && height <= maxSize) {
            return { width, height };
        }
        
        const ratio = Math.min(maxSize / width, maxSize / height);
        return {
            width: Math.round(width * ratio),
            height: Math.round(height * ratio)
        };
    }

    // Upload image to Supabase Storage
    async uploadImage(file, folder = 'general') {
        try {
            // Convert to WebP
            const webpBlob = await this.convertToWebP(file);
            
            // Generate unique filename
            const timestamp = Date.now();
            const randomId = Math.random().toString(36).substring(2);
            const fileName = `${folder}/${timestamp}_${randomId}.webp`;
            
            // Upload to Supabase
            const { data, error } = await this.supabase.storage
                .from(this.bucketName)
                .upload(fileName, webpBlob, {
                    contentType: 'image/webp',
                    upsert: false
                });

            if (error) throw error;

            // Get public URL
            const { data: { publicUrl } } = this.supabase.storage
                .from(this.bucketName)
                .getPublicUrl(fileName);

            return {
                success: true,
                url: publicUrl,
                path: fileName
            };
        } catch (error) {
            console.error('Upload error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Delete image from storage
    async deleteImage(filePath) {
        try {
            const { error } = await this.supabase.storage
                .from(this.bucketName)
                .remove([filePath]);

            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('Delete error:', error);
            return { success: false, error: error.message };
        }
    }

    // Upload multiple images
    async uploadMultipleImages(files, folder = 'gallery') {
        const results = [];
        
        for (const file of files) {
            const result = await this.uploadImage(file, folder);
            results.push(result);
        }
        
        return results;
    }
}

// Usage functions for the provider portal
async function uploadProfilePicture(file) {
    const converter = new ImageConverter(supabaseClient);
    const result = await converter.uploadImage(file, 'profiles');
    
    if (result.success) {
        // Update preview
        document.getElementById('profilePicturePreview').innerHTML = 
            `<img src="${result.url}" class="w-24 h-24 object-cover rounded-full">`;
        document.getElementById('profilePictureUrl').value = result.url;
        document.getElementById('removeProfileBtn').style.display = 'inline-block';
        
        // Store path for potential deletion
        document.getElementById('profilePictureUrl').dataset.path = result.path;
        
        showUploadSuccess('Profile picture uploaded successfully!');
    } else {
        showUploadError('Failed to upload profile picture: ' + result.error);
    }
    
    return result;
}

async function uploadWorkPhotos(files) {
    const converter = new ImageConverter(supabaseClient);
    const results = await converter.uploadMultipleImages(files, 'gallery');
    
    const preview = document.getElementById('workPhotosPreview');
    const existingUrls = document.getElementById('workPhotosUrls').value.split(',').filter(url => url.trim());
    
    results.forEach((result, index) => {
        if (result.success) {
            const photoDiv = document.createElement('div');
            photoDiv.className = 'relative group';
            photoDiv.innerHTML = `
                <img src="${result.url}" class="w-full h-20 object-cover rounded-lg cursor-pointer hover:opacity-75 transition-opacity" onclick="previewImage('${result.url}')">
                <button type="button" onclick="removeWorkPhoto(this, '${result.url}', '${result.path}')" class="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    <i class="fas fa-times"></i>
                </button>
            `;
            preview.appendChild(photoDiv);
            existingUrls.push(result.url);
        } else {
            showUploadError(`Failed to upload image ${index + 1}: ${result.error}`);
        }
    });
    
    document.getElementById('workPhotosUrls').value = existingUrls.join(',');
    updateGalleryButtons();
    
    const successCount = results.filter(r => r.success).length;
    if (successCount > 0) {
        showUploadSuccess(`${successCount} photo(s) uploaded successfully!`);
    }
}

// Enhanced remove functions with storage cleanup
async function removeWorkPhotoWithCleanup(button, url, path) {
    if (path) {
        const converter = new ImageConverter(supabaseClient);
        await converter.deleteImage(path);
    }
    
    button.parentElement.remove();
    const urls = document.getElementById('workPhotosUrls').value.split(',').filter(u => u !== url);
    document.getElementById('workPhotosUrls').value = urls.join(',');
    updateGalleryButtons();
}

async function removeProfilePictureWithCleanup() {
    const urlInput = document.getElementById('profilePictureUrl');
    const path = urlInput.dataset.path;
    
    if (path) {
        const converter = new ImageConverter(supabaseClient);
        await converter.deleteImage(path);
    }
    
    const preview = document.getElementById('profilePicturePreview');
    preview.innerHTML = '<i class="fas fa-camera text-gray-400 text-xl"></i>';
    urlInput.value = '';
    urlInput.dataset.path = '';
    document.getElementById('removeProfileBtn').style.display = 'none';
    document.getElementById('profilePictureInput').value = '';
}

// Notification functions
function showUploadSuccess(message) {
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
    notification.innerHTML = `<i class="fas fa-check mr-2"></i>${message}`;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.remove(), 3000);
}

function showUploadError(message) {
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
    notification.innerHTML = `<i class="fas fa-exclamation-triangle mr-2"></i>${message}`;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.remove(), 5000);
}