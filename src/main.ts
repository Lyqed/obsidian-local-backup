import { Notice, Plugin } from "obsidian";
import { join } from "path";
import * as path from "path";
import * as fs from "fs-extra";
import { LocalBackupSettingTab } from "./settings";
import {
	getDatePlaceholdersForISO,
	replaceDatePlaceholdersWithValues,
} from "./utils";

interface LocalBackupPluginSettings {
	startupSetting: boolean;
	lifecycleSetting: string;
	savePathSetting: string;
	customizeNameSetting: string;
	intervalToggleSetting: boolean;
	intervalValueSetting: string;
}

const DEFAULT_SETTINGS: LocalBackupPluginSettings = {
	startupSetting: false,
	lifecycleSetting: "3",
	savePathSetting: getDefaultPath(),
	customizeNameSetting: getDefaultName(),
	intervalToggleSetting: false,
	intervalValueSetting: "10",
};

export default class LocalBackupPlugin extends Plugin {
	settings: LocalBackupPluginSettings;
	intervalId: NodeJS.Timeout | null = null;

	async onload() {
		await this.loadSettings();

		// this.app.workspace.on('window-close', await this.backupRepository.bind(this));

		// Run local backup command
		this.addCommand({
			id: "run-local-backup",
			name: "Run local backup",
			callback: async () => {
				// this.backupVaultAsync();
				await this.archiveVaultAsync();
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new LocalBackupSettingTab(this.app, this));

		// run startup codes.
		if (this.settings.startupSetting) {
			// await this.backupVaultAsync();
			await this.archiveVaultAsync();
		}

		// run auto delete method
		autoDeleteBackups(
			this.settings.savePathSetting,
			this.settings.customizeNameSetting,
			this.settings.lifecycleSetting
		);

		await this.applySettings();
	}

	/**
	 * Archive vault method
	 */
	async archiveVaultAsync() {
		try {
			const fileName = this.settings.customizeNameSetting;
			// const backupFolderName = `${vaultName}-Backup-${currentDate}`;
			const fileNameWithDateValues =
				replaceDatePlaceholdersWithValues(fileName);
			const backupZipName = `${fileNameWithDateValues}.zip`;
			const vaultPath = (this.app.vault.adapter as any).basePath;
			const parentDir = this.settings.savePathSetting;
			// const backupFolderPath = join(parentDir, backupFolderName);
			const backupZipPath = join(parentDir, backupZipName);

			const AdmZip = require('adm-zip');
			const zip = new AdmZip();
			zip.addLocalFolder(vaultPath);
			zip.writeZip(backupZipPath);
			new Notice(`Vault backup created: ${backupZipPath}`);
		} catch (error) {
			new Notice(`Failed to create vault backup: ${error}`);
			console.log(error);
		}
	}

	/**
	 * Start an interval to run archiveVaultAsync method at regular intervals
	 * @param intervalMinutes The interval in minutes
	 */
	startAutoBackupInterval(intervalMinutes: number) {
		if (this.intervalId) {
			clearInterval(this.intervalId);
		}

		this.intervalId = setInterval(async () => {
			await this.archiveVaultAsync();
		}, intervalMinutes * 60 * 1000); // Convert minutes to milliseconds

		new Notice(
			`Auto backup interval started: Running every ${intervalMinutes} minutes.`
		);
	}

	/**
	 * Stop the auto backup interval
	 */
	stopAutoBackupInterval() {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
			new Notice("Auto backup interval stopped.");
		}
	}

	async onunload() {
		console.log("Local Backup unloaded");
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Apply settings
	 */
	async applySettings() {
		// load settings
		await this.loadSettings();

		// Start the interval if intervalToggleSetting is true and intervalValueSetting is a valid number
		if (
			this.settings.intervalToggleSetting &&
			!isNaN(parseInt(this.settings.intervalValueSetting))
		) {
			const intervalMinutes = parseInt(
				this.settings.intervalValueSetting
			);
			this.startAutoBackupInterval(intervalMinutes);
		} else if (!this.settings.intervalToggleSetting) {
			this.stopAutoBackupInterval();
		}
	}

	/**
	 * Restore default settings
	 */
	async restoreDefault() {
		this.settings.startupSetting = DEFAULT_SETTINGS.startupSetting;
		this.settings.lifecycleSetting = DEFAULT_SETTINGS.lifecycleSetting;
		this.settings.savePathSetting = DEFAULT_SETTINGS.savePathSetting;
		this.settings.customizeNameSetting = DEFAULT_SETTINGS.customizeNameSetting;
		this.settings.intervalToggleSetting = DEFAULT_SETTINGS.intervalToggleSetting;
		this.settings.intervalValueSetting = DEFAULT_SETTINGS.intervalValueSetting
		await this.saveSettings();
	}
}

/**
 * Get path of current vault
 * @returns
 */
function getDefaultPath(): string {
	const defaultPath = path.dirname((this.app.vault.adapter as any).basePath);
	// this.settings.savePathSetting = defaultPath
	return defaultPath;
}

/**
 * Get default backup name
 * @returns
 */
function getDefaultName(): string {
	const vaultName = this.app.vault.getName();
	const defaultDatePlaceholders = getDatePlaceholdersForISO(true);
	return `${vaultName}-Backup-${defaultDatePlaceholders}`;
}

/**
 * Auto delete backups
 */
function autoDeleteBackups(savePathSetting: string, customizeNameSetting: string, lifecycleSetting: string) {
	console.log("Run auto delete method");

	if (parseInt(lifecycleSetting) == 0) {
		return;
	}

	const currentDate = new Date();
	currentDate.setDate(currentDate.getDate() - parseInt(lifecycleSetting));

	// deleting backups before the lifecycle
	fs.readdir(savePathSetting, (err, files) => {
		if (err) {
			console.error(err);
			return;
		}

		files.forEach((file) => {
			// console.log(file);
			const filePath = path.join(savePathSetting, file);
			const stats = fs.statSync(filePath);
			const fileNameRegex = generateRegexFromCustomPattern(customizeNameSetting)
			const matchFileName = file.match(fileNameRegex);
			// console.log(matchFileName)
			if (stats.isFile() && matchFileName != null) {

				const stats = fs.statSync(filePath);
				const parseTime = stats.birthtime;
				const createDate = new Date(parseTime.getFullYear(), parseTime.getMonth(), parseTime.getDate());
				if (createDate < currentDate) {
					fs.remove(filePath);
				}
			}
		});
	});
}

/**
 * Generate regex from custom pattern,
 * @param customPattern 
 * @returns 
 */
function generateRegexFromCustomPattern(customPattern: string): RegExp {
	// Replace placeholders like %Y, %m, etc. with corresponding regex patterns
	const regexPattern = customPattern
		.replace(/%Y/g, '\\d{4}') // Year
		.replace(/%m/g, '\\d{2}') // Month
		.replace(/%d/g, '\\d{2}') // Day
		.replace(/%H/g, '\\d{2}') // Hour
		.replace(/%M/g, '\\d{2}') // Minute
		.replace(/%S/g, '\\d{2}'); // Second

	// Create a regular expression to match the custom pattern
	return new RegExp(regexPattern);
}
