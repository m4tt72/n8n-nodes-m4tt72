import { readFile as fsReadFile } from 'fs/promises';
import { IExecuteFunctions } from 'n8n-core';
import {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';
import youtubedl from 'youtube-dl-exec';

export class YoutubeDownloadNode implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Youtube Download',
		name: 'youtubeDownloadNode',
		group: ['m4tt72'],
		icon: 'file:youtube-dl.svg',
		version: 1,
		description: 'Use youtube-dl to download videos',
		defaults: {
			name: 'Use youtube-dl to download videos',
		},
		inputs: ['main'],
		outputs: ['main'],
		properties: [
			{
				displayName: 'Url',
				name: 'url',
				type: 'string',
				default: '',
				placeholder: 'eg: https://www.youtube.com/watch?v=',
				description: 'URL of the video to download',
				required: true,
			},
			{
				displayName: 'Property Name',
				name: 'dataPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				description: 'Name of the binary property to which to write the data of the read file',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();

		let item: INodeExecutionData;
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const url = this.getNodeParameter('url', itemIndex, '') as string;
				const dataPropertyName = this.getNodeParameter('dataPropertyName', itemIndex) as string;

				item = items[itemIndex];

				const info = await youtubedl(url, {
					dumpSingleJson: true,
					noCheckCertificates: true,
					noWarnings: true,
					addHeader: ['referer:youtube.com', 'user-agent:googlebot'],
				});

				await youtubedl.exec(url, {
					noCheckCertificates: true,
					noWarnings: true,
					addHeader: ['referer:youtube.com', 'user-agent:googlebot'],
					output: '%(id)s.%(ext)s',
				});

				const filePath = `${info.id}.${info.ext}`;

				let data;

				try {
					data = (await fsReadFile(filePath)) as Buffer;
				} catch (error) {
					if (error.code === 'ENOENT') {
						throw new NodeOperationError(
							this.getNode(),
							`The file "${filePath}" could not be found.`,
						);
					}

					throw error;
				}

				const newItem: INodeExecutionData = {
					json: item.json,
					binary: {},
					pairedItem: {
						item: itemIndex,
					},
				};

				if (item.binary !== undefined && newItem.binary) {
					Object.assign(newItem.binary, item.binary);
				}

				newItem.binary![dataPropertyName] = await this.helpers.prepareBinaryData(data, filePath);
				newItem.json['videoInfo'] = info;

				returnData.push(newItem);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: this.getInputData(itemIndex)[0].json,
						error,
						pairedItem: itemIndex,
					});
				} else {
					if (error.context) {
						error.context.itemIndex = itemIndex;

						throw error;
					}
					throw new NodeOperationError(this.getNode(), error, {
						itemIndex,
					});
				}
			}
		}

		return this.prepareOutputData(returnData);
	}
}
